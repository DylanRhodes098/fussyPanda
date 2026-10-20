"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("passwordResetTokens", {
    id: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    userId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    tokenHash: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    usedAt: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    createdAt: {
      allowNull: false,
      type: Sequelize.DATE,
      defaultValue: Sequelize.fn("NOW"),
    },
    updatedAt: {
      allowNull: false,
      type: Sequelize.DATE,
      defaultValue: Sequelize.fn("NOW"),
    },
  });

  await queryInterface.addIndex("passwordResetTokens", ["userId"]);
  await queryInterface.addIndex("passwordResetTokens", ["tokenHash"]);
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("passwordResetTokens");
};
