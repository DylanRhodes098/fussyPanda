import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

export const PHOTO_STUDIO_CREDIT_ENTRY_TYPES = Object.freeze({
  GRANT: "grant",
  RESERVE: "reserve",
  CONSUME: "consume",
  RELEASE: "release",
  EXPIRE: "expire",
  ADJUSTMENT: "adjustment",
});

class PhotoStudioCreditLedgerEntryModel extends Model {}

const PhotoStudioCreditLedgerEntry =
  sequelize.models.PhotoStudioCreditLedgerEntry ||
  PhotoStudioCreditLedgerEntryModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      operationId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      guestId: { type: DataTypes.UUID, allowNull: true },
      bucketId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      chatId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      agentMessageId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_CREDIT_ENTRY_TYPES)],
        },
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
        },
      },
      idempotencyKey: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioCreditLedgerEntry",
      tableName: "photoStudioCreditLedgerEntries",
      timestamps: true,
    },
  );

export { PhotoStudioCreditLedgerEntry };
export default PhotoStudioCreditLedgerEntry;
