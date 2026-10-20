"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioCreditBuckets", {
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
    kind: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    sourceId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    grantKey: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    allowance: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    remaining: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    reserved: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    periodStart: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    periodEnd: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    expiresAt: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "active",
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

  await queryInterface.addIndex("photoStudioCreditBuckets", ["grantKey"], {
    unique: true,
    name: "photoStudioCreditBuckets_grantKey_unique",
  });

  await queryInterface.addIndex(
    "photoStudioCreditBuckets",
    ["userId", "status"],
    {
      name: "photoStudioCreditBuckets_userId_status",
    },
  );
  await queryInterface.addIndex(
    "photoStudioCreditBuckets",
    ["userId", "kind"],
    {
      name: "photoStudioCreditBuckets_userId_kind",
    },
  );

  await queryInterface.addIndex("photoStudioCreditBuckets", ["expiresAt"], {
    name: "photoStudioCreditBuckets_expiresAt",
  });
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioCreditBuckets");
};
