
require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = 3000;

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    await client.connect();
    const db = client.db("weatherdb");
    const collection = db.collection("records");

    // สร้างเงื่อนไขการค้นหา
    const matchStage = {};
    if (searchQuery) {
      // ใช้ regex เพื่อค้นหาแบบ case-insensitive และ partial match
      matchStage.city = { $regex: searchQuery, $options: 'i' };
    }

    // 1. ดึงข้อมูลล่าสุดของแต่ละจังหวัด
    // 2. จัดกลุ่มตามภาค (region)
    const pipeline = [
      { $match: matchStage }, // เพิ่ม stage สำหรับการกรองข้อมูล
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$city",
          doc: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { city: 1 } },
      {
        $group: {
          _id: "$region",
          provinces: { $push: "$$ROOT" }
        }
      },
      { $sort: { _id: 1 } } // เรียงตามชื่อภาค
    ];

    const regions = await collection.aggregate(pipeline).toArray();

    res.render('index', { regions, query: searchQuery });
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาด");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
