import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

export const PHOTO_STUDIO_MESSAGE_ROLES = Object.freeze({
  USER: "user",
  AGENT: "agent",
});

export const PHOTO_STUDIO_MESSAGE_TYPES = Object.freeze({
  SOURCE_IMAGE: "source_image",
  INSTRUCTION: "instruction",
  GENERATED_IMAGE: "generated_image",
});

export const PHOTO_STUDIO_MESSAGE_STATUSES = Object.freeze({
  PENDING: "pending",
  GENERATING: "generating",
  COMPLETED: "completed",
  FAILED: "failed",
});

class PhotoStudioMessageModel extends Model {}
const PhotoStudioMessage =
  sequelize.models.PhotoStudioMessage ||
  PhotoStudioMessageModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      chatId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_MESSAGE_ROLES)],
        },
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_MESSAGE_TYPES)],
        },
      },
      text: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      storagePath: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PHOTO_STUDIO_MESSAGE_STATUSES.PENDING,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_MESSAGE_STATUSES)],
        },
      },
      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
        },
      },
      parentAgentMessageId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      creditOperationId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      model: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      generatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioMessage",
      tableName: "photoStudioMessages",
      timestamps: true,
    },
  );

export { PhotoStudioMessage };
export default PhotoStudioMessage;
