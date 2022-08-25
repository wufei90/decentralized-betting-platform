// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {
  const Token = await hre.ethers.getContractFactory("BeTX");
  const token = await Token.deploy();
  await token.deployed();
  console.log("token deployed to:", token.address);

  const BetBroker = await hre.ethers.getContractFactory("BetBroker");
  const betBroker = await BetBroker.deploy(token.address);
  await betBroker.deployed();
  console.log("betBroker deployed to:", betBroker.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
