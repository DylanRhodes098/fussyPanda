"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioMessages", {
    id: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    chatId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "photoStudioChats",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    role: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    type: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    text: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    storagePath: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    sequence: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    parentAgentMessageId: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    creditOperationId: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    model: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    generatedAt: {
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

  await queryInterface.addConstraint("photoStudioMessages", {
    fields: ["parentAgentMessageId"],
    type: "foreign key",
    name: "photoStudioMessages_parentAgentMessageId_fk",
    references: {
      table: "photoStudioMessages",
      field: "id",
    },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  });

  await queryInterface.addIndex("photoStudioMessages", ["chatId"], {
    name: "photoStudioMessages_chatId",
  });

  await queryInterface.addIndex("photoStudioMessages", ["chatId", "sequence"], {
    unique: true,
    name: "photoStudioMessages_chatId_sequence_unique",
  });

  await queryInterface.addIndex(
    "photoStudioMessages",
    ["parentAgentMessageId"],
    {
      name: "photoStudioMessages_parentAgentMessageId",
    },
  );

  await queryInterface.addIndex("photoStudioMessages", ["chatId", "status"], {
    name: "photoStudioMessages_chatId_status",
  });
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioMessages");
};
