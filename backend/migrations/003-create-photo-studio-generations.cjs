"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioGenerations", {
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
    creditOperationId: { type: Sequelize.UUID, allowNull: true },
    environmentId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "photoStudioEnvironments",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "generating",
    },
    sourceImageUrl: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    sourceStoragePath: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    generatedImageUrl: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    generatedStoragePath: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    errorMessage: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    retryCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    generatedAt: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    savedAt: {
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

  await queryInterface.addIndex("photoStudioGenerations", ["userId"], {
    name: "photoStudioGenerations_userId",
  });
  await queryInterface.addIndex("photoStudioGenerations", ["environmentId"], {
    name: "photoStudioGenerations_environmentId",
  });

  await queryInterface.addIndex("photoStudioGenerations", ["status"], {
    name: "photoStudioGenerations_status",
  });
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioGenerations");
};
