import express from "express";

const app = express();

const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.send("AI MONSTER U is LIVE");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U",
    mode: "demo"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("AI MONSTER U is running");
  console.log("PORT:", PORT);
});
