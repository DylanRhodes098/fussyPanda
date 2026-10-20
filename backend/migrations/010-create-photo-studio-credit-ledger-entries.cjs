"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioCreditLedgerEntries", {
    id: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    operationId: {
      type: Sequelize.UUID,
      allowNull: false,
    },
    userId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    bucketId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "photoStudioCreditBuckets",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    chatId: {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "photoStudioChats",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    agentMessageId: {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "photoStudioMessages",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    type: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    amount: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    idempotencyKey: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    metadata: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    },
  });

  await queryInterface.addIndex(
    "photoStudioCreditLedgerEntries",
    ["idempotencyKey"],
    {
      unique: true,
      name: "photoStudioCreditLedgerEntries_idempotency_unique",
    },
  );
  await queryInterface.addIndex(
    "photoStudioCreditLedgerEntries",
    ["operationId"],
    {
      name: "photoStudioCreditLedgerEntries_operationId",
    },
  );

  await queryInterface.addIndex(
    "photoStudioCreditLedgerEntries",
    ["userId", "createdAt"],
    {
      name: "photoStudioCreditLedgerEntries_userId_createdAt",
    },
  );

  await queryInterface.addIndex(
    "photoStudioCreditLedgerEntries",
    ["bucketId"],
    {
      name: "photoStudioCreditLedgerEntries_bucketId",
    },
  );

  await queryInterface.addIndex(
    "photoStudioCreditLedgerEntries",
    ["agentMessageId"],
    {
      name: "photoStudioCreditLedgerEntries_agentMessageId",
    },
  );
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioCreditLedgerEntries");
};
