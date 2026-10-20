import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

export const PHOTO_STUDIO_CREDIT_KINDS = Object.freeze({
  SIGNUP: "signup",
  GUEST_TRIAL: "guest_trial",
  CLAIMED_TRIAL: "claimed_trial",
  STUDIO_SUBSCRIPTION: "studio_subscription",
});

export const PHOTO_STUDIO_CREDIT_BUCKET_STATUSES = Object.freeze({
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
});

class PhotoStudioCreditBucketModel extends Model {}

const PhotoStudioCreditBucket =
  sequelize.models.PhotoStudioCreditBucket ||
  PhotoStudioCreditBucketModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      guestId: { type: DataTypes.UUID, allowNull: true },
      kind: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_CREDIT_KINDS)],
        },
      },
      sourceId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      grantKey: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      allowance: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      remaining: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      reserved: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
        },
      },
      periodStart: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      periodEnd: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PHOTO_STUDIO_CREDIT_BUCKET_STATUSES.ACTIVE,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_CREDIT_BUCKET_STATUSES)],
        },
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioCreditBucket",
      tableName: "photoStudioCreditBuckets",
      timestamps: true,
    },
  );

export { PhotoStudioCreditBucket };
export default PhotoStudioCreditBucket;
