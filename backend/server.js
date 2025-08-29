import "dotenv/config";
import express from "express";
import aiRoutes from "./routes/ai.route.js";

const app = express();

app.use(express.json());
app.use("/api", aiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
