const express = require("express");
require('dotenv').config()
const path = require('path');
const bodyParser = require('body-parser');
const cors = require("cors");
const port = process.env.PORT_HTTP;


const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const bfr = require("./bfr/bfr");
const coor = require("./coor/coor");
const route_type = require("./route_type/route_type");
const route = require("./route/route");
const user = require("./user/user");
const admin = require("./admin/admin");
const department = require("./department/department");
const apply_ac = require("./apply_ac/apply_ac");

app.use("/rin", bfr);
app.use("/acr", coor);
app.use("/rt", route_type);
app.use("/rou", route);
app.use("/usr", user);
// app.use("/adm", admin);
app.use("/dpt", department);
app.use("/ac", apply_ac);
app.listen(port, () => {
    console.log('ERP Running as port '+port);
})