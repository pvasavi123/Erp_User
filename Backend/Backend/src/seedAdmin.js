const bcrypt = require("bcrypt");
const { sequelize, Admin } = require("./core/database");

async function seed() {
    try {
        await sequelize.sync();

        const existingAdmin = await Admin.findOne({
            where: { email: "srinu@gmail.com" }
        });

        if (existingAdmin) {
            console.log("Admin already exists.");
            process.exit();
        }

        const hashedPassword = await bcrypt.hash("admin123", 10);

        await Admin.create({
            name: "Admin",
            email: "srinu@gmail.com",
            password: hashedPassword
        });

        console.log("Admin inserted successfully.");
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();