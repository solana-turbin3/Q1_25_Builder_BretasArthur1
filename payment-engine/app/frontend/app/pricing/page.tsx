"use client"

import { Check, X } from "lucide-react"
import { Header } from "@/components/header"
import { BlockchainGrid } from "@/components/ui/blockchain-grid"
import { WalletParticles } from "@/components/ui/wallet-particles"
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react"
import { useCallback, useState } from "react"
import { createAnchorClient } from "@/lib/anchorClient"
import { PublicKey, Transaction } from "@solana/web3.js"
import { toast } from "sonner"
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token"

// Subscription tiers configuration
// Each tier represents a different plan level with specific features and pricing
const tiers = [
  {
    name: 'Basic',
    id: 1,
    price: '10',
    description: 'Basic plan with 20 requests',
    features: [
      { name: '20 requests', included: true },
      { name: 'Priority Support', included: false },
    ],
    buttonText: 'Get Basic'
  },
  {
    name: 'Standard',
    id: 2,
    price: '20',
    description: 'Standard plan with 50 requests',
    features: [
      { name: '50 requests', included: true },
      { name: 'Priority Support', included: true },
    ],
    buttonText: 'Get Standard'
  },
  {
    name: 'Premium',
    id: 3,
    price: '50',
    description: 'Premium plan with 100 requests',
    features: [
      { name: '100 requests', included: true },
      { name: 'Priority Support', included: true },
    ],
    buttonText: 'Get Premium'
  },
]

// Constants for USDC token and authority
const TEST_USDC_MINT_KEY = new PublicKey("9ThGirbgEtRrjwtg1DVZ4fD5BkPAWtseYpgrsLH3NFu8");
const SWQUERY_AUTHORITY = new PublicKey("9qSchFvHkadxQkSpY8T5sX4iTJRT9go21jFgAWiGLsue");

export default function PricingPage() {
  // Wallet and connection hooks for Solana interaction
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  // Track loading state for each tier's purchase button
  const [loading, setLoading] = useState<Record<number, boolean>>({});

  // Handle the purchase of a subscription plan
  const handlePurchase = useCallback(async (tier: number) => {
    if (!publicKey || !anchorWallet) {
      toast.error("Please connect your wallet first")
      return
    }

    try {
      // Set loading state for the selected tier
      setLoading(prev => ({ ...prev, [tier]: true }));

      // Initialize Anchor client for program interaction
      const client = createAnchorClient(anchorWallet)

      // Get or create token accounts for both user and SWQuery
      const userTokenAccount = await getAssociatedTokenAddress(
        TEST_USDC_MINT_KEY,
        publicKey
      )

      // Get the swquery's token account address
      const swqueryTokenAccount = await getAssociatedTokenAddress(
        TEST_USDC_MINT_KEY,
        SWQUERY_AUTHORITY
      )

      // Check if the token accounts exist
      let userAccountExists = false;
      let swqueryAccountExists = false;

      try {
        await getAccount(connection, userTokenAccount);
        userAccountExists = true;
      } catch {
        console.log("User token account doesn't exist, will create it");
      }

      try {
        await getAccount(connection, swqueryTokenAccount);
        swqueryAccountExists = true;
      } catch {
        console.log("Swquery token account doesn't exist, will create it");
      }

      // Create token accounts if they don't exist
      if (!userAccountExists || !swqueryAccountExists) {
        const createAccountsTx = new Transaction();

        // Add instructions to create missing token accounts
        if (!userAccountExists) {
          createAccountsTx.add(
            createAssociatedTokenAccountInstruction(
              publicKey, // payer
              userTokenAccount, // ata
              publicKey, // owner
              TEST_USDC_MINT_KEY, // mint
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }

        if (!swqueryAccountExists) {
          createAccountsTx.add(
            createAssociatedTokenAccountInstruction(
              publicKey, // payer
              swqueryTokenAccount, // ata
              SWQUERY_AUTHORITY, // owner
              TEST_USDC_MINT_KEY, // mint
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }

        const latestBlockhash = await connection.getLatestBlockhash();
        createAccountsTx.recentBlockhash = latestBlockhash.blockhash;
        createAccountsTx.feePayer = publicKey;

        try {
          // Sign and send the create accounts transaction
          const signedTx = await anchorWallet.signTransaction(createAccountsTx);
          const createAccountsSig = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: true, // Skip simulation
            maxRetries: 5
          });
          
          console.log("Sending create accounts transaction:", createAccountsSig);
          
          const confirmation = await connection.confirmTransaction({
            signature: createAccountsSig,
            ...latestBlockhash
          });
          
          console.log("Create accounts confirmation:", confirmation);

          console.log("Created token accounts:", {
            signature: createAccountsSig,
            userTokenAccount: userTokenAccount.toBase58(),
            swqueryTokenAccount: swqueryTokenAccount.toBase58()
          });
        } catch (txError) {
          console.error("Error creating token accounts:", txError);
          throw txError;
        }
      }

      console.log("Transaction setup:", {
        user: publicKey.toBase58(),
        userTokenAccount: userTokenAccount.toBase58(),
        swqueryTokenAccount: swqueryTokenAccount.toBase58(),
        swqueryAuthority: SWQUERY_AUTHORITY.toBase58(),
        mint: TEST_USDC_MINT_KEY.toBase58(),
        tier
      });
      
      // Use timestamp as seed for the escrow
      const seed = Date.now()

      try {
        // Process the escrow creation with the selected plan
        const result = await client.makeEscrow(
          seed,
          tier,
          userTokenAccount,
          swqueryTokenAccount,
          SWQUERY_AUTHORITY
        )

        // Handle success or failure of the purchase
        if (result.success) {
          toast.success("Successfully purchased plan!")
          console.log("Purchase successful:", {
            signature: result.signature,
            escrowAddress: result.escrowAddress?.toBase58()
          })
        } else {
          console.error("Purchase failed:", result.error)
          toast.error("Failed to purchase plan: " + result.error?.message)
        }
      } catch (escrowError) {
        console.error("Detailed escrow error:", {
          error: escrowError,
          message: escrowError instanceof Error ? escrowError.message : "Unknown error",
          accounts: {
            user: publicKey.toBase58(),
            userTokenAccount: userTokenAccount.toBase58(),
            swqueryTokenAccount: swqueryTokenAccount.toBase58(),
            swqueryAuthority: SWQUERY_AUTHORITY.toBase58(),
            mint: TEST_USDC_MINT_KEY.toBase58()
          }
        });
        throw escrowError;
      }
      
    } catch (error) {
      // Handle various error scenarios with user-friendly messages
      console.error("Error purchasing plan:", error)
      if (error instanceof Error) {
        if (error.message.includes("User rejected")) {
          toast.error("Transaction was rejected by user")
        } else if (error.message.includes("insufficient funds")) {
          toast.error("Insufficient funds for transaction")
        } else {
          toast.error(`Failed to purchase plan: ${error.message}`)
        }
      } else {
        toast.error("Failed to purchase plan")
      }
    } finally {
      // Reset loading state after completion
      setLoading(prev => ({ ...prev, [tier]: false }));
    }
  }, [publicKey, anchorWallet, connection]);

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 wallet-bg opacity-5" />
      <BlockchainGrid />
      <WalletParticles />
      <div className="relative">
        <Header />
        <div className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="text-base font-semibold leading-7 text-purple-500">Pricing</h1>
              <p className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
                Choose the perfect plan for your brand
              </p>
              <p className="mt-6 text-lg leading-8 text-white/70">
                Transform your business with our professional wallet analysis services
              </p>
            </div> 
            <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className="rounded-3xl bg-[#0F0F0F] p-8 ring-1 ring-gray-800"
                >
                  <h3 className="text-2xl font-bold text-white">
                    {tier.name}
                  </h3>
                  
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl font-bold text-purple-500">${tier.price}</span>
                  </p>
                  <ul role="list" className="mt-8 space-y-3 text-base leading-6 text-gray-300">
                    {tier.features.map((feature) => (
                      <li key={feature.name} className="flex gap-x-3">
                        {feature.included ? (
                          <Check className="h-6 w-5 flex-none text-purple-500" aria-hidden="true" />
                        ) : (
                          <X className="h-6 w-5 flex-none text-gray-500" aria-hidden="true" />
                        )}
                        {feature.name}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handlePurchase(tier.id)}
                    disabled={loading[tier.id] || !publicKey}
                    className={`mt-8 block w-full rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-3 py-3 text-center text-sm font-semibold text-white transition-all ${
                      loading[tier.id] 
                        ? 'opacity-50 cursor-not-allowed'
                        : !publicKey
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:opacity-90'
                    }`}
                  >
                    {loading[tier.id] 
                      ? 'Processing...' 
                      : !publicKey
                      ? 'Connect Wallet'
                      : tier.buttonText}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

