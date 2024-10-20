const express = require("express");
const axios = require("axios"); // Add this line to import axios
const fs = require("fs");
const cors = require("cors"); // Add this line to import cors

const {
  NeynarAPIClient,
  AuthorizationUrlResponseType,
  FeedType,
  FilterType,
} = require("@neynar/nodejs-sdk");
var { json } = require("body-parser");
require("dotenv").config({ path: ".env" });

const app = express();

app.use(json());
app.use(cors()); // Add this line to enable CORS for all routes

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
    let alchemyUrl = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getOwnersForContract?contractAddress=${contractAddress}&withTokenBalances=false`;
    let ownersResponse = await axios.get(alchemyUrl, {
      headers: { accept: 'application/json' },
    });
    let owners = ownersResponse.data.owners;

    if (owners.length === 0) {
      alchemyUrl = `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getOwnersForContract?contractAddress=${contractAddress}&withTokenBalances=false`;
      ownersResponse = await axios.get(alchemyUrl, {
        headers: { accept: 'application/json' },
      });
      owners = ownersResponse.data.owners;
    }


    // Step 2: Look up FIDs for owners
    const fids = [];
    let feed = null;
    const BATCH_SIZE = 350;
    const MAX_FIDS = 100;

    try {
      for (let i = 0; i < owners.length && fids.length < MAX_FIDS; i += BATCH_SIZE) {
        const batch = owners.slice(i, i + BATCH_SIZE); // Create a batch of addresses
        const users = await client.fetchBulkUsersByEthereumAddress(batch);
        for (const addr of batch) {
          if (fids.length >= MAX_FIDS) break;
          for (const [key, value] of Object.entries(users)) {
            if (key?.toLowerCase() === addr?.toLowerCase()) {
              fids.push(value[0].fid);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error looking up FIDs:', error);
    }
    
    try {
      const feedRes = await axios.get('https://api.neynar.com/v2/farcaster/feed', {
        headers: {
          accept: 'application/json',
          api_key: NEYNAR_API_KEY,
        },
        params: {
          feed_type: FeedType.Filter,
          filter_type: FilterType.Fids,
          fids: fids.join(","),
          with_recasts: true,
          limit: 25
        }
      });
      feed = feedRes.data;
    } catch (error) {
      console.error('Error fetching feed:', error);
    }

    res.json({
      contractAddress,
      totalOwners: owners.length,
      // farcasterUsers: fids.length,
      fids: fids.length,
      feed
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
