const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Mirrors the contract's commit scheme: keccak256(abi.encodePacked(secret, sender))
function commitFor(secret, address) {
  return ethers.solidityPackedKeccak256(["uint256", "address"], [secret, address]);
}

function randomSecret() {
  return BigInt(ethers.hexlify(ethers.randomBytes(32)));
}

describe("WhipDuelArena", function () {
  async function deploy() {
    const [a, b, c] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WhipDuelArena");
    const arena = await Factory.deploy();
    await arena.waitForDeployment();
    return { arena, a, b, c };
  }

  const WAGER = ethers.parseEther("1");

  describe("lobby: create / join / cancel", function () {
    it("creates an open duel and escrows the wager", async function () {
      const { arena, a } = await deploy();
      const secretA = randomSecret();
      const commitA = commitFor(secretA, a.address);

      await expect(arena.connect(a).createDuel(commitA, { value: WAGER }))
        .to.emit(arena, "DuelCreated")
        .withArgs(0n, a.address, WAGER);

      expect(await ethers.provider.getBalance(await arena.getAddress())).to.equal(WAGER);

      const duel = await arena.getDuel(0);
      expect(duel.playerA).to.equal(a.address);
      expect(duel.status).to.equal(1); // Open
    });

    it("rejects a zero-value duel or a zero commit hash", async function () {
      const { arena, a } = await deploy();
      await expect(arena.connect(a).createDuel(commitFor(1n, a.address), { value: 0 })).to.be.revertedWith(
        "wager must be > 0"
      );
      await expect(arena.connect(a).createDuel(ethers.ZeroHash, { value: WAGER })).to.be.revertedWith("bad commit");
    });

    it("lets a second player join by matching the wager exactly", async function () {
      const { arena, a, b } = await deploy();
      const secretA = randomSecret();
      const secretB = randomSecret();
      await arena.connect(a).createDuel(commitFor(secretA, a.address), { value: WAGER });

      await expect(arena.connect(b).joinDuel(0, commitFor(secretB, b.address), { value: WAGER })).to.emit(
        arena,
        "DuelJoined"
      );

      const duel = await arena.getDuel(0);
      expect(duel.playerB).to.equal(b.address);
      expect(duel.status).to.equal(2); // Committed
    });

    it("rejects joining your own duel, a wrong wager amount, or an already-committed duel", async function () {
      const { arena, a, b, c } = await deploy();
      const secretA = randomSecret();
      await arena.connect(a).createDuel(commitFor(secretA, a.address), { value: WAGER });

      await expect(
        arena.connect(a).joinDuel(0, commitFor(randomSecret(), a.address), { value: WAGER })
      ).to.be.revertedWith("cannot duel yourself");

      await expect(
        arena.connect(b).joinDuel(0, commitFor(randomSecret(), b.address), { value: WAGER / 2n })
      ).to.be.revertedWith("wager mismatch");

      await arena.connect(b).joinDuel(0, commitFor(randomSecret(), b.address), { value: WAGER });

      await expect(
        arena.connect(c).joinDuel(0, commitFor(randomSecret(), c.address), { value: WAGER })
      ).to.be.revertedWith("duel not open");
    });

    it("lets the creator cancel and refunds them while still open", async function () {
      const { arena, a } = await deploy();
      const secretA = randomSecret();
      await arena.connect(a).createDuel(commitFor(secretA, a.address), { value: WAGER });

      const before = await ethers.provider.getBalance(a.address);
      const tx = await arena.connect(a).cancelDuel(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const after = await ethers.provider.getBalance(a.address);
      expect(after).to.equal(before - gasCost + WAGER);

      const duel = await arena.getDuel(0);
      expect(duel.status).to.equal(4); // Cancelled
    });

    it("does not let a non-creator cancel, or cancel after someone has joined", async function () {
      const { arena, a, b } = await deploy();
      await arena.connect(a).createDuel(commitFor(randomSecret(), a.address), { value: WAGER });
      await expect(arena.connect(b).cancelDuel(0)).to.be.revertedWith("not your duel");

      await arena.connect(b).joinDuel(0, commitFor(randomSecret(), b.address), { value: WAGER });
      await expect(arena.connect(a).cancelDuel(0)).to.be.revertedWith("duel not open");
    });
  });

  describe("commit-reveal + combat resolution", function () {
    async function createAndJoin(arena, a, b, secretA, secretB) {
      await arena.connect(a).createDuel(commitFor(secretA, a.address), { value: WAGER });
      await arena.connect(b).joinDuel(0, commitFor(secretB, b.address), { value: WAGER });
    }

    it("rejects a reveal that doesn't match the commitment", async function () {
      const { arena, a, b } = await deploy();
      const secretA = randomSecret();
      await createAndJoin(arena, a, b, secretA, randomSecret());
      await expect(arena.connect(a).reveal(0, secretA + 1n)).to.be.revertedWith(
        "secret does not match commitment"
      );
    });

    it("rejects reveals from non-participants and double reveals", async function () {
      const { arena, a, b, c } = await deploy();
      const secretA = randomSecret();
      await createAndJoin(arena, a, b, secretA, randomSecret());
      await expect(arena.connect(c).reveal(0, 1n)).to.be.revertedWith("not a participant");

      await arena.connect(a).reveal(0, secretA);
      await expect(arena.connect(a).reveal(0, secretA)).to.be.revertedWith("already revealed");
    });

    it("resolves the fight automatically once both sides reveal, paying the full pot to a winner", async function () {
      const { arena, a, b } = await deploy();
      const secretA = randomSecret();
      const secretB = randomSecret();
      await createAndJoin(arena, a, b, secretA, secretB);

      await arena.connect(a).reveal(0, secretA);
      const tx = await arena.connect(b).reveal(0, secretB);
      const receipt = await tx.wait();

      const roundEvents = receipt.logs.filter((l) => {
        try {
          return arena.interface.parseLog(l).name === "RoundResolved";
        } catch {
          return false;
        }
      });
      expect(roundEvents.length).to.be.greaterThan(0);

      const resolvedEvent = receipt.logs
        .map((l) => {
          try {
            return arena.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((e) => e && (e.name === "DuelResolved" || e.name === "DuelDrawn"));
      expect(resolvedEvent).to.not.be.undefined;

      const duel = await arena.getDuel(0);
      expect(duel.status).to.equal(3); // Resolved

      if (resolvedEvent.name === "DuelResolved") {
        const winner = resolvedEvent.args.winner;
        expect([a.address, b.address]).to.include(winner);
        expect(await arena.balances(winner)).to.equal(WAGER * 2n);

        const loser = winner === a.address ? b.address : a.address;
        expect(await arena.balances(loser)).to.equal(0n);

        // Winner can withdraw exactly once.
        const before = await ethers.provider.getBalance(winner);
        const signer = winner === a.address ? a : b;
        const wtx = await arena.connect(signer).withdraw();
        const wreceipt = await wtx.wait();
        const gasCost = wreceipt.gasUsed * wreceipt.gasPrice;
        const after = await ethers.provider.getBalance(winner);
        expect(after).to.equal(before - gasCost + WAGER * 2n);

        await expect(arena.connect(signer).withdraw()).to.be.revertedWith("nothing to withdraw");
      } else {
        // Simultaneous double-KO: both get their wager back.
        expect(await arena.balances(a.address)).to.equal(WAGER);
        expect(await arena.balances(b.address)).to.equal(WAGER);
      }
    });

    it("is deterministic: identical secrets always produce the identical fight log", async function () {
      const { arena, a, b } = await deploy();
      const secretA = 12345n;
      const secretB = 67890n;

      await createAndJoin(arena, a, b, secretA, secretB);
      await arena.connect(a).reveal(0, secretA);
      const tx1 = await arena.connect(b).reveal(0, secretB);
      const receipt1 = await tx1.wait();
      const rounds1 = receipt1.logs
        .map((l) => {
          try {
            return arena.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "RoundResolved")
        .map((e) => [e.args.round.toString(), e.args.dmgToB.toString(), e.args.dmgToA.toString()]);

      // Second, independent duel with the same two secrets must play out identically
      // except that the seed also mixes in duelId, so re-derive with duelId=1 expectations
      // by simply checking internal consistency: resolving twice with the same duelId inputs
      // (via a fresh contract instance) reproduces the same log.
      const Factory = await ethers.getContractFactory("WhipDuelArena");
      const arena2 = await Factory.deploy();
      await arena2.waitForDeployment();
      await arena2.connect(a).createDuel(commitFor(secretA, a.address), { value: WAGER });
      await arena2.connect(b).joinDuel(0, commitFor(secretB, b.address), { value: WAGER });
      await arena2.connect(a).reveal(0, secretA);
      const tx2 = await arena2.connect(b).reveal(0, secretB);
      const receipt2 = await tx2.wait();
      const rounds2 = receipt2.logs
        .map((l) => {
          try {
            return arena2.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "RoundResolved")
        .map((e) => [e.args.round.toString(), e.args.dmgToB.toString(), e.args.dmgToA.toString()]);

      expect(rounds2).to.deep.equal(rounds1);
    });
  });

  describe("timeouts / griefing protection", function () {
    it("awards the pot by forfeit if only one side reveals before the deadline", async function () {
      const { arena, a, b } = await deploy();
      const secretA = randomSecret();
      await arena.connect(a).createDuel(commitFor(secretA, a.address), { value: WAGER });
      await arena.connect(b).joinDuel(0, commitFor(randomSecret(), b.address), { value: WAGER });

      await arena.connect(a).reveal(0, secretA);

      await expect(arena.connect(a).claimTimeout(0)).to.be.revertedWith("reveal window still open");

      await time.increase(15 * 60 + 1);

      await expect(arena.claimTimeout(0)).to.emit(arena, "DuelResolved").withArgs(0n, a.address, WAGER * 2n);
      expect(await arena.balances(a.address)).to.equal(WAGER * 2n);
    });

    it("refunds both sides if neither reveals before the deadline", async function () {
      const { arena, a, b } = await deploy();
      await arena.connect(a).createDuel(commitFor(randomSecret(), a.address), { value: WAGER });
      await arena.connect(b).joinDuel(0, commitFor(randomSecret(), b.address), { value: WAGER });

      await time.increase(15 * 60 + 1);
      await expect(arena.claimTimeout(0)).to.emit(arena, "DuelDrawn").withArgs(0n, WAGER);

      expect(await arena.balances(a.address)).to.equal(WAGER);
      expect(await arena.balances(b.address)).to.equal(WAGER);
    });

    it("cannot be claimed before the deadline passes", async function () {
      const { arena, a, b } = await deploy();
      await arena.connect(a).createDuel(commitFor(randomSecret(), a.address), { value: WAGER });
      await arena.connect(b).joinDuel(0, commitFor(randomSecret(), b.address), { value: WAGER });
      await expect(arena.claimTimeout(0)).to.be.revertedWith("reveal window still open");
    });
  });

  describe("combat constants sanity", function () {
    it("exposes the same numbers the simulate script assumes", async function () {
      const { arena } = await deploy();
      const [attackRoll, defenceRoll, maxHit, hpStart, maxRounds] = await arena.combatConstants();
      expect(attackRoll).to.equal(16060n);
      expect(defenceRoll).to.equal(9523n);
      expect(maxHit).to.equal(24n);
      expect(hpStart).to.equal(99n);
      expect(maxRounds).to.equal(60n);
    });
  });
});
