const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME;
const email = process.argv[2];
const newPassword = process.argv[3];

if (!uri || !dbName || !email || !newPassword) {
  console.error("Uso: MONGO_URI=... MONGO_DB_NAME=... node reset-password.js <email> <novaSenha>");
  process.exit(1);
}

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection("users");

    const user = await users.findOne({ email });
    if (!user) {
      console.log(`NAO_ENCONTRADO: nenhum usuario com email ${email}`);
      const all = await users.find({}, { projection: { email: 1, role: 1 } }).toArray();
      console.log("Usuarios existentes:", all.map((u) => `${u.email} (${u.role})`));
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await users.updateOne(
      { _id: user._id },
      { $set: { passwordHash }, $unset: { refreshTokenHashes: "" } }
    );

    console.log(`OK: senha atualizada para ${email}. matched=${result.matchedCount} modified=${result.modifiedCount}`);
  } finally {
    await client.close();
  }
})();
