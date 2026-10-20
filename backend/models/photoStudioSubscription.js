import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

export const PHOTO_STUDIO_PLAN_TIERS = Object.freeze({
  NONE: "none",
  BASIC: "basic",
  PRO: "pro",
  ENTERPRISE: "enterprise",
});

class PhotoStudioSubscriptionModel extends Model {}

const PhotoStudioSubscription =
  sequelize.models.PhotoStudioSubscription ||
  PhotoStudioSubscriptionModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      checkoutSessionId: { type: DataTypes.STRING, allowNull: true },
      checkoutPlan: { type: DataTypes.STRING, allowNull: true },
      stripeCustomerId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      stripeSubscriptionId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      stripePriceId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      planTier: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PHOTO_STUDIO_PLAN_TIERS.NONE,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_PLAN_TIERS)],
        },
      },
      subscriptionStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "none",
      },
      currentPeriodStart: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      currentPeriodEnd: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancelAtPeriodEnd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      monthlyPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioSubscription",
      tableName: "photoStudioSubscriptions",
      timestamps: true,
    },
  );

export { PhotoStudioSubscription };
export default PhotoStudioSubscription;
