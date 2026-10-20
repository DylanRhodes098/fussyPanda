"use strict";

exports.up = async function (queryInterface, Sequelize) {
  await queryInterface.createTable("stripeWebhookEvents", {
    id: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    stripeEventId: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    type: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    processedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
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

  await queryInterface.addIndex("stripeWebhookEvents", ["stripeEventId"], {
    unique: true,
    name: "stripeWebhookEvents_stripeEventId_unique",
  });

  await queryInterface.addIndex("stripeWebhookEvents", ["type"], {
    name: "stripeWebhookEvents_type",
  });
};

exports.down = async function (queryInterface) {
  await queryInterface.dropTable("stripeWebhookEvents");
};
