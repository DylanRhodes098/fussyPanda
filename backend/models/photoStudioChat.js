import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

export const PHOTO_STUDIO_CHAT_STATUSES = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
});

class PhotoStudioChatModel extends Model {}

const PhotoStudioChat =
  sequelize.models.PhotoStudioChat ||
  PhotoStudioChatModel.init(
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
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PHOTO_STUDIO_CHAT_STATUSES.ACTIVE,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_CHAT_STATUSES)],
        },
      },
      sourceImageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sourceStoragePath: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      environmentImageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      environmentStoragePath: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      archivedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioChat",
      tableName: "photoStudioChats",
      timestamps: true,
    },
  );

export { PhotoStudioChat };
export default PhotoStudioChat;
