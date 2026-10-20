import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

export const PHOTO_STUDIO_ATTEMPT_STATUSES = Object.freeze({
  GENERATING: "generating",
  PASSED: "passed",
  REJECTED: "rejected",
  FAILED: "failed",
});

class PhotoStudioGenerationAttemptModel extends Model {}

const PhotoStudioGenerationAttempt =
  sequelize.models.PhotoStudioGenerationAttempt ||
  PhotoStudioGenerationAttemptModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      agentMessageId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      attemptNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
        },
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PHOTO_STUDIO_ATTEMPT_STATUSES.GENERATING,
        validate: {
          isIn: [Object.values(PHOTO_STUDIO_ATTEMPT_STATUSES)],
        },
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      model: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      temporaryImageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      temporaryStoragePath: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      qaScore: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0,
          max: 100,
        },
      },
      qaIssues: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioGenerationAttempt",
      tableName: "photoStudioGenerationAttempts",
      timestamps: true,
    },
  );

export { PhotoStudioGenerationAttempt };

export default PhotoStudioGenerationAttempt;
