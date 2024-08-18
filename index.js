const express = require("express");
const axios = require("axios"); // Add this line to import axios

const {
  NeynarAPIClient,
  AuthorizationUrlResponseType,
} = require("@neynar/nodejs-sdk");
var { json } = require("body-parser");
require("dotenv").config({ path: ".env" });

const app = express();

app.use(json());

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_CLIENT_ID = process.env.NEYNAR_CLIENT_ID;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

const client = new NeynarAPIClient(NEYNAR_API_KEY);
app.get("/get-auth-url", async (_, res) => {
  try {
    console.log("NEYNAR_CLIENT_ID", NEYNAR_CLIENT_ID);
    const { authorization_url } = await client.fetchAuthorizationUrl(
      NEYNAR_CLIENT_ID,
      AuthorizationUrlResponseType.Code
    );
    res.json({ authorization_url });
  } catch (error) {
    if (error.isAxiosError) {
      console.error("Error:", error);
      res.status(error.response.status).json({ error });
    } else {
      console.error("Error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
});

app.get("/user", async (req, res) => {
  const { fid } = req.query;

  try {
    const { users } = await client.fetchBulkUsers([fid]);
    const user = users[0];
    const { display_name, pfp_url } = user;
    res.json({ display_name, pfp_url });
  } catch (error) {
    if (error.isAxiosError) {
      console.error("Error:", error);
      res.status(error.response.status).json({ error });
    } else {
      console.error("Error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
});

app.post("/cast", async (req, res) => {
  const { signerUuid, text } = req.body;

  try {
    const { hash } = await client.publishCast(signerUuid, text);
    res.json({ hash });
  } catch (error) {
    if (error.isAxiosError) {
      console.error("Error:", error);
      res.status(error.response.status).json({ error });
    } else {
      console.error("Error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
});

app.get("/nft-holders/:contractAddress", async (req, res) => {
  console.log('Received request for contract address:', req.params.contractAddress);
  try {
    const { contractAddress } = req.params;
    // console.log('contract add is', contractAddress)
    // // Step 1: Get NFT owners
    const alchemyUrl = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getOwnersForContract?contractAddress=${contractAddress}&withTokenBalances=false`;
    const ownersResponse = await axios.get(alchemyUrl, {
      headers: { accept: 'application/json' },
    });
    const owners = ownersResponse.data.owners; // Limit to 500 owners
    

    // Step 2: Look up FIDs for owners
    const fids = [];
    const BATCH_SIZE = 350;

    try {
      for (let i = 0; i < owners.length; i += BATCH_SIZE) {
        const batch = owners.slice(i, i + BATCH_SIZE); // Create a batch of addresses
        console.log('batches', batch)
        const users = await client.fetchBulkUsersByEthereumAddress(batch);
        for (const addr of batch) {
          const user = users[addr]?.[0]; // Assuming the first user is the relevant one
          if (user && user.fid) {
            fids.push(user.fid); // Add valid FID to the array
          }
        }
      }
    } catch (error) {
      console.error('Error looking up FIDs:', error);
    }

    res.json({ 
      contractAddress,
      totalOwners: owners,
      // farcasterUsers: fids.length,
      fids: fids
    });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Failed to fetch NFT holders and their FIDs' });
  }
});

const PORT = 5500;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});