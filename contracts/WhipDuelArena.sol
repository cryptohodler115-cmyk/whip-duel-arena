// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * WhipDuelArena
 * =============
 * A trustless, on-chain PvP wagering duel. Two players each stake equal ETH,
 * a shared random seed is derived from a commit-reveal handshake between them,
 * and that seed drives a deterministic melee combat simulation that runs
 * entirely inside this contract. The winner is paid the full pot. No server,
 * no oracle, no admin key ever touches the outcome or the funds.
 *
 * Ruleset (deliberately stripped down — a "no food, no prayer, no potions"
 * duel-arena style fight):
 *   - Both fighters use identical, fixed stats and an identical weapon
 *     (a single fast slashing weapon, modeled loosely on a well-known MMO's
 *     top-tier whip-type weapon — see README for the exact numbers and why).
 *   - No consumables, no stat boosts, no healing. Whoever's HP hits 0 first
 *     loses the pot. Since both sides are numerically identical, the entire
 *     outcome is decided by the combat RNG seed — i.e. it's a coin flip
 *     shaped like a fight, same as a real symmetric-gear duel.
 *   - Fight length is capped (MAX_ROUNDS) purely to bound gas; with these
 *     stats a real fight almost always finishes well before the cap.
 *
 * Randomness: standard on-chain commit-reveal. Each player commits to
 * keccak256(secret, their own address) before either party knows the other's
 * secret. Only after BOTH players have committed can either reveal, so
 * neither side can choose a secret in reaction to the other's. The two
 * revealed secrets are combined into one seed that neither player controlled
 * alone. See README for the residual "won't reveal if I know I lose"
 * griefing vector and how claimTimeout() bounds it.
 *
 * This contract intentionally has no owner, no admin function, and takes no
 * fee — it only ever moves money between the two duelists (or refunds them).
 */
contract WhipDuelArena {
    // ---------------------------------------------------------------------
    // Combat constants (symmetric loadout — see README for the derivation)
    // ---------------------------------------------------------------------
    uint256 private constant HP_START = 99;

    // Fighting style bonus applied to an "accurate"-style attack.
    uint256 private constant STYLE_ATTACK_BONUS = 3;
    uint256 private constant STYLE_STRENGTH_BONUS = 0;

    // Base combat levels, both fighters identical.
    uint256 private constant ATTACK_LEVEL = 99;
    uint256 private constant STRENGTH_LEVEL = 99;
    uint256 private constant DEFENCE_LEVEL = 99;

    // Whip-equivalent gear bonuses (slash attack bonus / melee strength bonus
    // / slash defence bonus). Loosely modeled on a well known top-tier fast
    // slashing weapon; see README.
    uint256 private constant GEAR_ATTACK_BONUS = 82;
    uint256 private constant GEAR_STRENGTH_BONUS = 82;
    uint256 private constant GEAR_DEFENCE_BONUS = 25;

    uint256 public constant MAX_ROUNDS = 60;
    uint64 public constant REVEAL_WINDOW = 15 minutes;

    // Precomputed, since both fighters are identical.
    uint256 private immutable ATTACK_ROLL;
    uint256 private immutable DEFENCE_ROLL;
    uint256 private immutable MAX_HIT;

    constructor() {
        uint256 effAttack = ATTACK_LEVEL + STYLE_ATTACK_BONUS + 8;
        ATTACK_ROLL = effAttack * (GEAR_ATTACK_BONUS + 64);

        uint256 effDefence = DEFENCE_LEVEL + 8;
        DEFENCE_ROLL = effDefence * (GEAR_DEFENCE_BONUS + 64);

        uint256 effStrength = STRENGTH_LEVEL + STYLE_STRENGTH_BONUS + 8;
        MAX_HIT = (effStrength * (GEAR_STRENGTH_BONUS + 64) + 320) / 640;
    }

    // ---------------------------------------------------------------------
    // Duel state
    // ---------------------------------------------------------------------
    enum Status {
        None,
        Open, // waiting for an opponent to join
        Committed, // both joined, waiting for reveals
        Resolved, // fight happened, funds settled
        Cancelled // creator pulled out before anyone joined
    }

    struct Duel {
        address playerA;
        address playerB;
        uint256 wager; // each side's stake; pot = wager * 2
        bytes32 commitA;
        bytes32 commitB;
        uint256 secretA;
        uint256 secretB;
        bool revealedA;
        bool revealedB;
        uint64 revealDeadline;
        Status status;
        address winner; // address(0) until resolved; stays address(0) on a draw
    }

    uint256 public nextDuelId;
    mapping(uint256 => Duel) public duels;
    mapping(address => uint256) public balances; // pull-payment withdrawals

    // ---------------------------------------------------------------------
    // Events — the frontend replays a fight entirely from RoundResolved logs
    // ---------------------------------------------------------------------
    event DuelCreated(uint256 indexed duelId, address indexed playerA, uint256 wager);
    event DuelJoined(uint256 indexed duelId, address indexed playerB, uint64 revealDeadline);
    event DuelCancelled(uint256 indexed duelId);
    event Revealed(uint256 indexed duelId, address indexed player);
    event RoundResolved(
        uint256 indexed duelId,
        uint256 round,
        uint256 dmgToB,
        uint256 dmgToA,
        uint256 hpA,
        uint256 hpB
    );
    event DuelResolved(uint256 indexed duelId, address winner, uint256 pot);
    event DuelDrawn(uint256 indexed duelId, uint256 refundEach);
    event Withdrawn(address indexed player, uint256 amount);

    // ---------------------------------------------------------------------
    // Reentrancy guard (inlined so this file has zero imports and can be
    // pasted straight into Remix if you don't want to run Hardhat at all)
    // ---------------------------------------------------------------------
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "reentrancy");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ---------------------------------------------------------------------
    // Lobby: create / join / cancel
    // ---------------------------------------------------------------------

    /// @param commitHash keccak256(abi.encodePacked(secret, msg.sender)) — generate `secret`
    ///        client-side with a CSPRNG and never reuse it across duels.
    function createDuel(bytes32 commitHash) external payable returns (uint256 duelId) {
        require(msg.value > 0, "wager must be > 0");
        require(commitHash != bytes32(0), "bad commit");

        duelId = nextDuelId++;
        Duel storage d = duels[duelId];
        d.playerA = msg.sender;
        d.wager = msg.value;
        d.commitA = commitHash;
        d.status = Status.Open;

        emit DuelCreated(duelId, msg.sender, msg.value);
    }

    /// @param commitHash keccak256(abi.encodePacked(secret, msg.sender)), same rules as above.
    function joinDuel(uint256 duelId, bytes32 commitHash) external payable {
        Duel storage d = duels[duelId];
        require(d.status == Status.Open, "duel not open");
        require(msg.sender != d.playerA, "cannot duel yourself");
        require(msg.value == d.wager, "wager mismatch");
        require(commitHash != bytes32(0), "bad commit");

        d.playerB = msg.sender;
        d.commitB = commitHash;
        d.status = Status.Committed;
        d.revealDeadline = uint64(block.timestamp) + REVEAL_WINDOW;

        emit DuelJoined(duelId, msg.sender, d.revealDeadline);
    }

    /// Creator-only escape hatch while no opponent has joined yet.
    function cancelDuel(uint256 duelId) external nonReentrant {
        Duel storage d = duels[duelId];
        require(d.status == Status.Open, "duel not open");
        require(msg.sender == d.playerA, "not your duel");

        d.status = Status.Cancelled;
        uint256 amount = d.wager;
        d.wager = 0;
        emit DuelCancelled(duelId);
        _pay(d.playerA, amount);
    }

    // ---------------------------------------------------------------------
    // Commit-reveal + combat resolution
    // ---------------------------------------------------------------------

    function reveal(uint256 duelId, uint256 secret) external nonReentrant {
        Duel storage d = duels[duelId];
        require(d.status == Status.Committed, "not awaiting reveal");
        require(msg.sender == d.playerA || msg.sender == d.playerB, "not a participant");

        bytes32 h = keccak256(abi.encodePacked(secret, msg.sender));

        if (msg.sender == d.playerA) {
            require(!d.revealedA, "already revealed");
            require(h == d.commitA, "secret does not match commitment");
            d.secretA = secret;
            d.revealedA = true;
        } else {
            require(!d.revealedB, "already revealed");
            require(h == d.commitB, "secret does not match commitment");
            d.secretB = secret;
            d.revealedB = true;
        }

        emit Revealed(duelId, msg.sender);

        if (d.revealedA && d.revealedB) {
            _resolve(duelId);
        }
    }

    /// If the reveal window has passed:
    ///  - exactly one side revealed  -> that side wins the pot by forfeit
    ///  - neither side revealed      -> both wagers are refunded (mutual forfeit)
    ///  - both sides revealed        -> impossible to reach; reveal() already resolved it
    function claimTimeout(uint256 duelId) external nonReentrant {
        Duel storage d = duels[duelId];
        require(d.status == Status.Committed, "not awaiting reveal");
        require(block.timestamp > d.revealDeadline, "reveal window still open");

        d.status = Status.Resolved;
        uint256 pot = d.wager * 2;

        if (d.revealedA && !d.revealedB) {
            d.winner = d.playerA;
            emit DuelResolved(duelId, d.playerA, pot);
            balances[d.playerA] += pot;
        } else if (d.revealedB && !d.revealedA) {
            d.winner = d.playerB;
            emit DuelResolved(duelId, d.playerB, pot);
            balances[d.playerB] += pot;
        } else {
            emit DuelDrawn(duelId, d.wager);
            balances[d.playerA] += d.wager;
            balances[d.playerB] += d.wager;
        }
    }

    function _resolve(uint256 duelId) private {
        Duel storage d = duels[duelId];
        d.status = Status.Resolved;

        bytes32 seed = keccak256(abi.encodePacked(d.secretA, d.secretB, duelId, address(this)));

        uint256 hpA = HP_START;
        uint256 hpB = HP_START;
        uint256 round = 0;

        while (round < MAX_ROUNDS) {
            round++;

            uint256 dmgToB = _rollHits(seed, duelId, round, 1) ? _rollDamage(seed, duelId, round, 2) : 0;
            uint256 dmgToA = _rollHits(seed, duelId, round, 3) ? _rollDamage(seed, duelId, round, 4) : 0;

            hpB = dmgToB >= hpB ? 0 : hpB - dmgToB;
            hpA = dmgToA >= hpA ? 0 : hpA - dmgToA;

            emit RoundResolved(duelId, round, dmgToB, dmgToA, hpA, hpB);

            if (hpA == 0 || hpB == 0) break;
        }

        uint256 pot = d.wager * 2;

        if (hpA == 0 && hpB == 0) {
            // Simultaneous knockout — split the pot back evenly rather than
            // picking an arbitrary "winner".
            emit DuelDrawn(duelId, d.wager);
            balances[d.playerA] += d.wager;
            balances[d.playerB] += d.wager;
        } else if (hpB == 0 || (round == MAX_ROUNDS && hpA > hpB)) {
            d.winner = d.playerA;
            emit DuelResolved(duelId, d.playerA, pot);
            balances[d.playerA] += pot;
        } else if (hpA == 0 || (round == MAX_ROUNDS && hpB > hpA)) {
            d.winner = d.playerB;
            emit DuelResolved(duelId, d.playerB, pot);
            balances[d.playerB] += pot;
        } else {
            // Round cap hit with equal HP left — draw.
            emit DuelDrawn(duelId, d.wager);
            balances[d.playerA] += d.wager;
            balances[d.playerB] += d.wager;
        }
    }

    /// True/false hit roll using the exact-integer form of the classic
    /// accuracy formula: hitChance = atk>def ? 1-(def+2)/(2*(atk+1)) : atk/(2*(def+1)).
    function _rollHits(bytes32 seed, uint256 duelId, uint256 round, uint256 tag) private view returns (bool) {
        uint256 atk = ATTACK_ROLL;
        uint256 def = DEFENCE_ROLL;

        if (atk > def) {
            uint256 denom = 2 * (atk + 1);
            uint256 threshold = def + 2;
            uint256 r = _roll(seed, duelId, round, tag, denom);
            return r >= threshold;
        } else {
            uint256 denom = 2 * (def + 1);
            uint256 r = _roll(seed, duelId, round, tag, denom);
            return r < atk;
        }
    }

    function _rollDamage(bytes32 seed, uint256 duelId, uint256 round, uint256 tag) private view returns (uint256) {
        return _roll(seed, duelId, round, tag, MAX_HIT + 1);
    }

    function _roll(bytes32 seed, uint256 duelId, uint256 round, uint256 tag, uint256 mod) private pure returns (uint256) {
        if (mod == 0) return 0;
        return uint256(keccak256(abi.encodePacked(seed, duelId, round, tag))) % mod;
    }

    // ---------------------------------------------------------------------
    // Withdrawals (pull-payment pattern — payouts never push ETH directly)
    // ---------------------------------------------------------------------
    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing to withdraw");
        balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
    }

    function _pay(address to, uint256 amount) private {
        balances[to] += amount;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------
    function getDuel(uint256 duelId) external view returns (Duel memory) {
        return duels[duelId];
    }

    function combatConstants()
        external
        view
        returns (uint256 attackRoll, uint256 defenceRoll, uint256 maxHit, uint256 hpStart, uint256 maxRounds)
    {
        return (ATTACK_ROLL, DEFENCE_ROLL, MAX_HIT, HP_START, MAX_ROUNDS);
    }
}
