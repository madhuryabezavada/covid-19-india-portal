const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => console.log("Success"));
  } catch (e) {
    console.log(`Db error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400).send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400).send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const allStateList = `
  SELECT
  *
  FROM state;`;

  const stateList = await db.all(allStateList);

  response.send(
    stateList.map((eachObject) =>
      convertStateDbObjectToResponseObject(eachObject)
    )
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getState = `
    SELECT
     *
    FROM
      state
    WHERE
      state_id = ${stateId};`;
  const newState = await db.get(getState);
  const stateResult = convertStateDbObjectToResponseObject(newState);
  response.send(stateResult);
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrict = `
    SELECT
    *
    FROM district
    WHERE district_id = ${districtId};`;

    const newDistrict = await db.get(getDistrict);
    const districtResult = convertDistrictDbObjectToResponseObject(newDistrict);
    response.send(districtResult);
  }
);

app.post("/districts/", authenticateToken, async (request, response) => {
  const createDistricts = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = createDistricts;
  const newDistrict = `
     INSERT INTO
     district (district_name, state_id, cases, cured, active, deaths) 
     VALUES 
        ('${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths});`;

  const addDistrict = await db.run(newDistrict);
  const districtId = addDistrict.lastId;
  response.send("District Successfully Added");
});

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrict = `
    DELETE 
    FROM
    district
    WHERE
    district_id = ${districtId};`;
    await db.run(deleteDistrict);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;

    const updateDistrict = `
    UPDATE
    district
    SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
     cured = ${cured},
     active = ${active},
     deaths = ${deaths}
    WHERE
    district_id = ${districtId};`;

    await db.run(updateDistrict);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;

    const getStateStatsQuery = `
    SELECT
        SUM(cases),
        SUM(cured),
        SUM(active),
        SUM(deaths)
    FROM
        district
    WHERE
        state_id=${stateId};`;

    const stats = await db.get(getStateStatsQuery);

    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;