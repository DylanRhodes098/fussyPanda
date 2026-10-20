import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";
export default class PhotoStudioFile extends Model {}
PhotoStudioFile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    guestId: { type: DataTypes.UUID, allowNull: true },
    storagePath: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true,
    },
    previewPath: { type: DataTypes.STRING(512), allowNull: false },
  },
  { sequelize, modelName: "PhotoStudioFile", tableName: "photoStudioFiles" },
);
