import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

class StripeWebhookEventModel extends Model {}

const StripeWebhookEvent =
  sequelize.models.StripeWebhookEvent ||
  StripeWebhookEventModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      stripeEventId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "StripeWebhookEvent",
      tableName: "stripeWebhookEvents",
      timestamps: true,
    },
  );

export { StripeWebhookEvent };
export default StripeWebhookEvent;
