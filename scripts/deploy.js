const hre = require("hardhat");

async function main() {
  const Factory = await hre.ethers.getContractFactory("WhipDuelArena");
  const arena = await Factory.deploy();
  await arena.waitForDeployment();

  const address = await arena.getAddress();
  console.log(`WhipDuelArena deployed to: ${address}`);
  console.log(`Network: ${hre.network.name} (chainId ${hre.network.config.chainId ?? "unknown"})`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Copy this address into frontend/src/config/contract.ts`);
  console.log(`  2. Verify on the block explorer if you want (Blockscout, if supported):`);
  console.log(`     npx hardhat verify --network ${hre.network.name} ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
