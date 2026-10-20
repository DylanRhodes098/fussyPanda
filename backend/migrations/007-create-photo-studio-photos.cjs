"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioPhotos", {
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
    messageId: {
      type: Sequelize.UUID,
      allowNull: true,
      unique: true,
      references: { model: "photoStudioMessages", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    generationId: {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "photoStudioGenerations",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    imageUrl: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    storagePath: {
      type: Sequelize.TEXT,
      allowNull: false,
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

  await queryInterface.addIndex("photoStudioPhotos", ["userId"], {
    name: "photoStudioPhotos_userId",
  });

  await queryInterface.addIndex("photoStudioPhotos", ["generationId"], {
    unique: true,
    name: "photoStudioPhotos_generationId_unique",
  });

  await queryInterface.addIndex("photoStudioPhotos", ["userId", "createdAt"], {
    name: "photoStudioPhotos_userId_createdAt",
  });
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioPhotos");
};
