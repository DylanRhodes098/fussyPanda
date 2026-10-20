import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

class PhotoStudioPhotoModel extends Model {}

const PhotoStudioPhoto =
  sequelize.models.PhotoStudioPhoto ||
  PhotoStudioPhotoModel.init(
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
      },
      generationId: {
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
      },
      messageId: {
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
      },
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      storagePath: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "PhotoStudioPhoto",
      tableName: "photoStudioPhotos",
      timestamps: true,
    },
  );
export default PhotoStudioPhoto;
