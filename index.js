const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tx9lkv1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const campCollection = client.db("campMed").collection("camps");
    const participantCollection = client
      .db("campMed")
      .collection("participants");
    const userCollection = client.db("campMed").collection("users");
    const feedbackCollection = client.db("campMed").collection("feedback");
    const paymentCollection = client.db("campMed").collection("payments");

    // JWT related API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Used verifyAdmin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    // Users related API
    app.get("/users", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // Insert email if user doesn't exist
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.put("/user/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedUser = req.body;
      const user = {
        $set: {
          name: updatedUser.name,
          photo: updatedUser.photo,
          contact: updatedUser.contact,
        },
      };
      const result = await userCollection.updateOne(query, user, options);
      res.send(result);
    });

    // Camp Related API
    app.get("/camps", async (req, res) => {
      const cursor = campCollection.find().sort({ participantCount: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/camp/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const camp = await campCollection.findOne(query);
      res.send(camp);
    });

    app.get("/camp", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await campCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/camps", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await campCollection.insertOne(item);
      res.send(result);
    });

    app.patch("/camp/:id", verifyToken, verifyAdmin, async (req, res) => {
      const camp = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          campName: camp.campName,
          campFees: camp.campFees,
          image: camp.image,
          date: camp.date,
          time: camp.time,
          location: camp.location,
          healthcareProfessional: camp.healthcareProfessional,
          participantCount: camp.participantCount,
          description: camp.description,
          shortDescription: camp.shortDescription,
        },
      };
      const result = await campCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete(
      "/delete-camp/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await campCollection.deleteOne(query);
        res.send(result);
      }
    );

    // Participant related API
    app.get("/participant-camp", verifyToken, verifyAdmin, async (req, res) => {
      const cursor = participantCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/participant", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { participantEmail: email };
      const result = await participantCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/participants/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await participantCollection.findOne(query);
      res.send(result);
    });

    app.post("/participant", async (req, res) => {
      const participant = req.body;
      const result = await participantCollection.insertOne(participant);
      res.send(result);
    });

    app.patch("/participant/:email", verifyToken, async (req, res) => {
      const participant = req.body;
      const email = req.params.email;
      const filter = { participantEmail: email };
      const updateName = {
        $set: {
          participantName: participant.name,
        },
      };
      const result = await participantCollection.updateMany(filter, updateName);
      res.send(result);
    });

    app.patch("/participants/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          paymentStatus: "Paid",
        },
      };
      const result = await participantCollection.updateOne(
        filter,
        updateStatus
      );
      res.send(result);
    });

    app.patch(
      "/update-participant/:confirmId",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const confirmId = req.params.confirmId;
        const filter = { _id: new ObjectId(confirmId) };
        const updateStatus = {
          $set: {
            confirmation: "Confirmed",
          },
        };
        const result = await participantCollection.updateOne(
          filter,
          updateStatus
        );
        res.send(result);
      }
    );

    // Increase request to old collection
    app.put("/participant/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const result = await campCollection.updateOne(
        query,
        {
          $inc: {
            participantCount: +1,
          },
        },
        options
      );
      res.send(result);
    });

    app.delete("/participant-camp/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await participantCollection.deleteOne(query);
      res.send(result);
    });

    // Feedback related API
    app.get("/feedback", async (req, res) => {
      const cursor = feedbackCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/feedback", verifyToken, async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });

    // Payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req?.body;
      // console.log(price);
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Payment related API
    app.post("/payment", verifyToken, async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
