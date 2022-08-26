// To get DNS Information use curl or visit: localhost:3024/dns
const dns = require("dns");
const axios = require("axios");
const express = require("express");
const app = express();

// Variable Check List
const checkList = [
  "US",
  "United States",
  "CO",
  "Colorado",
  "NA",
  "North America",
  "Denver",
  null,
  null,
  39.7388,
  -104.9868,
  20,
  "America/Denver",
  751,
  "min",
  1657406382,
  "37.19.210.38",
  "",
  "37.19.210.38",
  "myip",
  1657406382,
  "192.168.0.200",
  "10.64.0.1",
];
let mainStatusErrorTrigger = [];
let mainStatus;

// DNS GET Request
app.get("/dns", async function (req, res) {
  let i = 1; // DNS Count Iterator
  let finalDnsInfo; // Final JSON Data Sent
  let dnsLeakRequest; // DNS Leak Request
  let dnsLeakResults; // DNS Leak Result

  let osDnsServers = dns.getServers(); // Get Operating System DNS
  let dnsList = osDnsServers.toString().replaceAll(",", "\n");

  // Add Operating System DNS found to final info.
  for (let osDnsServer of osDnsServers) {
    let dnsServerNum = { [`Local DNS ${i++}`]: osDnsServer };

    // Include Local DNS in Final JSON Info.
    finalDnsInfo = Object.assign(dnsServerNum);
  }

  // Get DNS Leak Results from External Provider
  try {
    dnsLeakRequest = await axios.get("https://ipleak.net/json/");
    dnsLeakResults = dnsLeakRequest.data;
  } catch (err) {
    // Unable To Get External DNS Lookup
    let customErrorMsg = `Unable to get external DNS results from https://ipleak.net/json.\nError: ${err}\n`;
    console.error(customErrorMsg);

    // Send Error Status and Message
    res.writeHead(503);
    res.write(customErrorMsg);
    res.end();
  }

  // Assign DNS leak results to final results.
  finalDnsInfo = Object.assign(dnsLeakResults, finalDnsInfo);

  // Format for PRTG
  let formattedJson = await formatJsonPrtg(finalDnsInfo, res);

  // Print Result Info.
  console.info(
    `DNS Status: ${mainStatus} ${
      mainStatusErrorTrigger.length >= 1
        ? `Error Trigger: ${JSON.stringify(mainStatusErrorTrigger)}.\n`
        : "\n"
    }DNS Properties:\nOperating System DNS:\n${dnsList}\nPublic IP: ${
      formattedJson.prtg.result[16].customunit
    }\nState: ${formattedJson.prtg.result[3].customunit}\n`
  );

  // Send Results
  res.writeHead(200, { "Content-Type": "application/json" });
  res.write(JSON.stringify(formattedJson) + "\n");
  res.end();
});

// Formats Results to JSON for PRTG
async function formatJsonPrtg(objData, res) {
  let formattedJson = []; // Reset JSON Return Array
  mainStatus = "OK"; // Reset Main Status OK
  mainStatusErrorTrigger = []; // Reset Error List Arrray
  let key = Object.keys(objData); // Sensor Name
  let value = Object.values(objData); // Sensor Status 0 OK 1 ERROR 2 Warning

  // Check Status Match then Assign Status Based on Property Value Match.
  // Example: State !== Colorado ? set ERROR : set OK
  for (let i = 0; i < Object.keys(objData).length; i++) {
    let isMatching; // Check if matched stored VPN data.
    let sensorState; // Status State: OK, WARNING, ERROR

    try {
      // Okay State
      if (value[i] === checkList[i]) {
        isMatching = 0;
        sensorState = "OK";
      } else {
        // Error State - Set Error if Region Code(2), State(3), or City change(6).
        if ([i].includes(2, 3, 6)) {
          // 2: Region Code 3: State: 6: City
          isMatching = 1;
          sensorState = "ERROR";

          mainStatus = "ERROR"; // Set Main Status to Error
          // Push Alerting Sensor Key Value and Position
          mainStatusErrorTrigger.push({
            [key[i]]: `Value: ${value[i]} Position: ${i}`,
          });
        }
        // Warning State - Set Warning if Accuracy Radius (11), OS DNS 1(21), or OS DNS 2(22).
        else if ([i].includes(11, 21, 22)) {
          isMatching = 1;
          sensorState = "Warning";
        }
        // Ignore Okay || Values may change on VPN reconnect
        else {
          isMatching = 0;
          sensorState = "OK";
        }
      }
    } catch (err) {
      let customErrorMsg = `Error: Unable to set sensor state values. Property: ${key[i]} Value ${value[i]}\n${err}\n`;
      console.error(customErrorMsg);
      res.writeHead(503);
      res.write(customErrorMsg);
      res.end();
      return;
    }

    // Format Result for PRTG
    try {
      formattedJson.push({
        channel: key[i].replaceAll("_", " "), // Value
        value: isMatching, // 0 OK 1 Error 2 Warn
        state: sensorState, // Value Status
        customunit: value[i], //  Unit/Measurement
      });
    } catch (err) {
      let customErrorMsg = `Error: Unable to push result to formattedJson object. Property: ${key[i]} Value ${value[i]}\n${err}\n`;
      console.error(customErrorMsg);
      res.writeHead(503);
      res.write(customErrorMsg);
      res.end();
      return;
    }
  }

  // Set Main Status - Error
  if (mainStatus === "ERROR") {
    formattedJson.push({
      channel: "VPN Connection Status", // Value
      value: "1", // 0 OK 1 Error 2 Warn
      state: "ERROR", // Value Status
      customunit: `NOT CONNECTED - ${mainStatusErrorTrigger}`, //  Unit/Measurement
    });
  }
  // Set Main Status - OK
  else {
    formattedJson.push({
      channel: "VPN Connection Status", // Value
      value: "0", // 0 OK 1 Error 2 Warn
      state: "OK", // Value Status
      customunit: "VPN Connected.", //  Unit/Measurement
    });
  }

  let formattedJson1 = Object.assign({ result: formattedJson });
  let formattedJson2 = Object.assign({ prtg: formattedJson1 });

  return formattedJson2;
}

app.listen(3024, () => {
  console.info(`PRTG DNS Monitoring Tool Listening on Port: 3024.`);
});
