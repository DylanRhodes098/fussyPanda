"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioChats", {
    id: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
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
    title: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    sourceImageUrl: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    sourceStoragePath: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    environmentImageUrl: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    environmentStoragePath: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    lastMessageAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    },
    archivedAt: {
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

  await queryInterface.addIndex("photoStudioChats", ["userId"], {
    name: "photoStudioChats_userId",
  });

  await queryInterface.addIndex("photoStudioChats", ["userId", "status"], {
    name: "photoStudioChats_userId_status",
  });

  await queryInterface.addIndex(
    "photoStudioChats",
    ["userId", "lastMessageAt"],
    {
      name: "photoStudioChats_userId_lastMessageAt",
    },
  );
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioChats");
};
