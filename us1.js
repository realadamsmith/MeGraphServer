// us1.js
import { MongoClient, ServerApiVersion } from 'mongodb';
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
app.use(bodyParser.json());

const uri = process.env.MongoURI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.post('/test', async (req, res) => {
  console.log('Request received:', req.body); 
  try {
    res.status(200).json({message: 'Test data received successfully'});
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({error: error.message});
  }
});

app.post('/testMongo', async (req, res) => {
  console.log('Request received:', req.body); 
  try {
    await client.connect(); 
    const database = client.db('userData'); 
    const collection = database.collection('user'); 
    const testDoc = await collection.findOne({});
    if (testDoc) {
      res.status(200).json({ message: 'MongoDB request succeeded', data: testDoc });
    } else {
      res.status(404).json({ message: 'No documents found' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } 
});

app.post('/storeYoutubeData', async (req, res) => {
  const {user, youtubeData} = req.body; 
  let collection;
  await client.connect();
  const db = client.db('userData');
  collection = db.collection('user');
  if (!collection) {
    res.status(500).json({error: 'DB connection not established'});
    return;
  }
  try {
    const existingUser = await collection.findOne({ "user.user.id": user.user.id });
    if (existingUser) {
        res.status(200).json({ message: 'User already exists, welcome' });
        // add func to track how many times the user has logged in
      } else {
        // User does not exist - insert a new document
        const result = await collection.insertOne({user, youtubeData});
        res.status(200).json({message: 'YoutubeData stored '});
      }

  } catch (error) {
    console.error('Error storing data:', error);
    res.status(500).json({error: error.message});
  }
});

app.post('/storeLikes', async (req, res) => {
  try {
    const likesData = req.body.likes; // Assuming likes is an array of video data
    await client.connect();
    const database = client.db('userData'); 
    const collection = database.collection('videoPosts'); 

    // Create bulk operations
    const bulkOps = likesData.map(likeData => {
      return {
        updateOne: {
          filter: { 
            userId: likeData.userId, 
            "video.videoId": likeData.video.videoId 
          },
          update: { $set: likeData },
          upsert: true
        }
      };
    });
    await collection.bulkWrite(bulkOps);
    res.status(200).json({ message: 'Likes stored/updated successfully' });
  } catch (error) {
    console.error('Error in bulk storing/updating likes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/homeFeed', async (req, res) => {
  const page = parseInt(req.query.page) || 1; 
  const limit = parseInt(req.query.limit) || 15; 
  const skip = (page - 1) * limit; // Calculate the number of documents to skip for pagination

  try {
    await client.connect();
    const database = client.db('userData'); 
    const collection = database.collection('videoPosts'); 
    const data = await collection.find({})
                                 .sort({ likedAt: -1 })
                                 .skip(skip)
                                 .limit(limit)
                                 .toArray();
    // Check if there is more data to send for the next page
    const totalCount = await collection.countDocuments();
    const isMore = skip + data.length < totalCount;

    res.status(200).json({ data, isMore });
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/likePost', async (req, res) => {
  const { userId, videoId } = req.body;

  try {
    await client.connect();
    const database = client.db('userData');
    const likedPostsCollection = database.collection('likedPosts');
    const videoPosts = database.collection('videoPosts');

    // Check if the user already liked the post
    const existingLike = await likedPostsCollection.findOne({ userId, videoId });
    if (existingLike) {
      return res.status(409).json({ message: 'User already liked this post' });
    }

    // Add the new like to likedPosts collection
    const likeResult = await likedPostsCollection.insertOne({ userId, videoId, createdAt: new Date() });

    // Increment the like count for the video in videoPosts
    const updateResult = await videoPosts.updateOne(
      { videoId: videoId },
      { $inc: { likeCount: 1 } }, // Increment the likeCount field
    );

    if (likeResult.insertedId && (updateResult.modifiedCount > 0 || updateResult.upsertedCount > 0)) {
      res.status(200).json({ message: 'Successfully liked the post' });
    } else {
      res.status(400).json({ message: 'Failed to like the post' });
    }
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.close();
  }
});

app.get('/likes', async (req, res) => {
  const { videoId } = req.query;
  try {
    await client.connect();
    const database = client.db('userData');
    const videoPosts = database.collection('videoPosts');
    const videoPost = await videoPosts.findOne({ videoId: videoId }, { projection: { likeCount: 1 } });
    res.status(200).json({ videoId, likesCount: videoPost ? videoPost.likeCount : 0 });
  } catch (error) {
    console.error('Error fetching likes:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.close();
  }
});

app.post('/commentPost', async (req, res) => {
  const { userId, videoId, comment } = req.body;

  try {
    await client.connect();
    const database = client.db('userData');
    const collection = database.collection('commentsCollection');
    
    const result = await collection.insertOne({ userId, videoId, comment, createdAt: new Date() });
    
    if (result.insertedId) {
      res.status(200).json({ message: 'Successfully commented on the post' });
    } else {
      res.status(400).json({ message: 'Failed to comment on the post' });
    }
  } catch (error) {
    console.error('Error commenting on post:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.close();
  }
});

app.get('/comments', async (req, res) => {
  const { videoId } = req.query;
  try {
    await client.connect();
    const database = client.db('userData');
    const collection = database.collection('commentsCollection');
    const comments = await collection.find({ videoId }).sort({ createdAt: -1 }).toArray();
    res.status(200).json({ videoId, comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.close();
  }
});


app.listen(5000, () => {
  console.log(`Server running on 5000`);
});

