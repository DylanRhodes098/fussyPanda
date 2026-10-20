import { Sequelize } from "sequelize";
import databaseConfig from "../config/database.cjs";

const sequelize = new Sequelize(databaseConfig());
export default sequelize;
