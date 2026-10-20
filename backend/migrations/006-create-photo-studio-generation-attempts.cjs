"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioGenerationAttempts", {
    id: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    agentMessageId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "photoStudioMessages",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    attemptNumber: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "generating",
    },
    provider: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    model: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    temporaryImageUrl: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    temporaryStoragePath: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    qaScore: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    qaIssues: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    errorMessage: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    startedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    },
    completedAt: {
      type: Sequelize.DATE,
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
    "photoStudioGenerationAttempts",
    ["agentMessageId"],
    {
      name: "photoStudioGenerationAttempts_agentMessageId",
    },
  );
  await queryInterface.addIndex(
    "photoStudioGenerationAttempts",
    ["agentMessageId", "attemptNumber"],
    {
      unique: true,
      name: "photoStudioGenerationAttempts_message_attempt_unique",
    },
  );

  await queryInterface.addIndex("photoStudioGenerationAttempts", ["status"], {
    name: "photoStudioGenerationAttempts_status",
  });
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioGenerationAttempts");
};
