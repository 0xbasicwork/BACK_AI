const { exec } = require('child_process');
require('dotenv').config();

module.exports = async function handleMoonboy(req, res) {
  const action = req.query.action || "generate";

  let command = "python back_moonboy.py";
  if (action === "generate") {
    command += " --generate";
  } else if (action === "trending") {
    command += " --trending";
  }

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing command: ${stderr}`);
      res.status(500).send("Moonboy agent encountered an error.");
      return;
    }
    res.send(stdout);
  });
};
