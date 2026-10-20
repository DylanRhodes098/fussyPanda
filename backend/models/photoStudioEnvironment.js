import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

class PhotoStudioEnvironmentModel extends Model {}

const PhotoStudioEnvironment =
  sequelize.models.PhotoStudioEnvironment ||
  PhotoStudioEnvironmentModel.init(
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
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      storagePath: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioEnvironment",
      tableName: "photoStudioEnvironments",
      timestamps: true,
    },
  );

export default PhotoStudioEnvironment;
