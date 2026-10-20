import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

export const PHOTO_STUDIO_GENERATION_STATUSES = Object.freeze({
  GENERATING: "generating",
  GENERATED: "generated",
  FAILED: "failed",
  SAVED: "saved",
});

class PhotoStudioGenerationModel extends Model {}

const PhotoStudioGeneration =
  sequelize.models.PhotoStudioGeneration ||
  PhotoStudioGenerationModel.init(
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
      creditOperationId: { type: DataTypes.UUID, allowNull: true },
      environmentId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PHOTO_STUDIO_GENERATION_STATUSES.GENERATING,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_GENERATION_STATUSES)],
        },
      },
      sourceImageUrl: DataTypes.TEXT,
      sourceStoragePath: DataTypes.TEXT,
      generatedImageUrl: DataTypes.TEXT,
      generatedStoragePath: DataTypes.TEXT,
      errorMessage: DataTypes.TEXT,
      retryCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      generatedAt: DataTypes.DATE,
      savedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "PhotoStudioGeneration",
      tableName: "photoStudioGenerations",
      timestamps: true,
    },
  );
export default PhotoStudioGeneration;
