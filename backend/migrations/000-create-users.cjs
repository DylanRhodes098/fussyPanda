exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("users", {
    id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
    ownerName: { type: Sequelize.STRING, allowNull: true },
    phone: { type: Sequelize.STRING(50), allowNull: true },
    email: { type: Sequelize.STRING(254), allowNull: false, unique: true },
    avatar: { type: Sequelize.STRING, allowNull: true },
    password: { type: Sequelize.STRING, allowNull: true },
    authProvider: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "local",
    },
    providerId: { type: Sequelize.STRING, allowNull: true },
    accountType: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "photo_studio",
    },
    tokenVersion: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false },
  });
  await queryInterface.addIndex("users", ["authProvider", "providerId"], {
    unique: true,
  });
};
exports.down = async function (queryInterface) {
  await queryInterface.dropTable("users");
};
