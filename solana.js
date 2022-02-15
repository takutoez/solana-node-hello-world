import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'

import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import { getPayer, getRpcUrl, createKeypairFromFile } from './utils.js'

let connection, payer, programId, pubkey

/**
 * Path to program files
 */
const PROGRAM_PATH = path.resolve(__dirname, '../solana-rust-hello-world/target/deploy/')

/**
 * Path to program shared object file which should be deployed on chain.
 * This file is created when running either:
 *   - `npm run build:program-c`
 *   - `npm run build:program-rust`
 */
const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, 'solana_rust_hello_world.so')

/**
 * Path to the keypair of the deployed program.
 * This file is created when running `solana program deploy dist/program/helloworld.so`
 */
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, 'solana_rust_hello_world-keypair.json')

const HELLO_WORLD_SIZE = 50

/**
 * Establish a connection to the cluster
 */
export async function establishConnection() {
  const rpcUrl = await getRpcUrl()
  connection = new Connection(rpcUrl, 'confirmed')
  const version = await connection.getVersion()
  console.log('Connection to cluster established:', rpcUrl, version)
}

export async function establishPayer() {
  let fees = 0
  if (!payer) {
    const {feeCalculator} = await connection.getRecentBlockhash()

    // Calculate the cost to fund the greeter account
    fees += await connection.getMinimumBalanceForRentExemption(HELLO_WORLD_SIZE)

    // Calculate the cost of sending transactions
    fees += feeCalculator.lamportsPerSignature * 100 // wag

    payer = await getPayer()
  }

  let lamports = await connection.getBalance(payer.publicKey)
  if (lamports < fees) {
    // If current balance is not enough to pay for fees, request an airdrop
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      fees - lamports,
    )
    await connection.confirmTransaction(sig)
    lamports = await connection.getBalance(payer.publicKey)
  }

  console.log(
    'Using account',
    payer.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'SOL to pay for fees',
  )
}

/**
 * Check if the hello world BPF program has been deployed
 */
export async function checkProgram() {
  // Read program id from keypair file
  try {
    const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH)
    programId = programKeypair.publicKey
  } catch (err) {
    const errMsg = err.message
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy /path/to/solana_rust_hello_world.so\``,
    )
  }

  // Check if the program has been deployed
  const programInfo = await connection.getAccountInfo(programId)
  if (programInfo === null) {
    if (fs.existsSync(PROGRAM_SO_PATH)) {
      throw new Error(
        'Program needs to be deployed with `solana program deploy /path/to/solana_rust_hello_world.so`',
      )
    } else {
      throw new Error('Program needs to be built and deployed')
    }
  } else if (!programInfo.executable) {
    throw new Error(`Program is not executable`)
  }
  console.log(`Using program ${programId.toBase58()}`)

  // Derive the address (public key) of a account from the program so that it's easy to find later.
  const HELLO_WORLD_SEED = 'hello_world'
  pubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    HELLO_WORLD_SEED,
    programId,
  )

  // Check if the account has already been created
  const greetedAccount = await connection.getAccountInfo(pubkey)
  if (greetedAccount === null) {
    console.log(
      'Creating account',
      pubkey.toBase58()
    )
    const lamports = await connection.getMinimumBalanceForRentExemption(
      HELLO_WORLD_SIZE,
    )

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: HELLO_WORLD_SEED,
        newAccountPubkey: pubkey,
        lamports,
        space: HELLO_WORLD_SIZE,
        programId,
      }),
    )
    await sendAndConfirmTransaction(connection, transaction, [payer])
  }
}

/**
 * Run the Solana program.
 */
export async function runSolanaProgram() {
  console.log('Pubkey: ', pubkey.toBase58())
  const instruction = new TransactionInstruction({
    keys: [{pubkey: pubkey, isSigner: false, isWritable: true}],
    programId,
    data: Buffer.alloc(0)
  })
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payer],
  )
}

/**
 * Get the account information.
 */
export async function getAccountInfo() {
  const accountInfo = await connection.getAccountInfo(pubkey)
  if (accountInfo === null) {
    throw 'Error: cannot find the account'
  }
  console.log('AccountInfo: ', accountInfo)
}
