require("dotenv").config();
const app = require("./app");

// Vercel/serverless compatibility
module.exports = app;

if (require.main === module) {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`Server running on port ${port}`));
}