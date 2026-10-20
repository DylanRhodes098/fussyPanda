"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("photoStudioSubscriptions", {
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
    checkoutSessionId: { type: Sequelize.STRING, allowNull: true },
    checkoutPlan: { type: Sequelize.STRING, allowNull: true },
    stripeCustomerId: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    stripeSubscriptionId: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    stripePriceId: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    planTier: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "none",
    },
    subscriptionStatus: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "none",
    },
    currentPeriodStart: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    currentPeriodEnd: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    cancelAtPeriodEnd: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    monthlyPrice: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
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

  await queryInterface.addIndex("photoStudioSubscriptions", ["userId"], {
    unique: true,
    name: "photoStudioSubscriptions_userId_unique",
  });

  await queryInterface.addIndex(
    "photoStudioSubscriptions",
    ["stripeSubscriptionId"],
    {
      unique: true,
      name: "photoStudioSubscriptions_stripeSubscriptionId_unique",
    },
  );

  await queryInterface.addIndex(
    "photoStudioSubscriptions",
    ["subscriptionStatus"],
    {
      name: "photoStudioSubscriptions_status",
    },
  );
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("photoStudioSubscriptions");
};
