import {
  establishConnection,
  establishPayer,
  checkProgram,
  runSolanaProgram,
  getAccountInfo,
} from './solana.js'

async function main() {
  console.log('Start...')
  // Establish connection to the cluster
  await establishConnection()

  // Determine who pays for the fees
  await establishPayer()

  // Check if the program has been deployed
  await checkProgram()

  // Run Solana program
  await runSolanaProgram()

  // Get the account information
  await getAccountInfo()

  console.log('Success')
}

main().then(
  () => process.exit(),
  err => {
    console.error(err)
    process.exit(-1)
  },
)
