const fs = require("fs");
const axios = require("axios");
const { opslagPad, opties, nutsPad } = require("../config.js");
const { pakScript, pakOpslag, schrijfOpslag } = require(nutsPad);
const dagenDb = pakScript("dagen-database");

async function consolideerAdressen() {
  // losse json naar één json bestand
  // schrijf naar db dat adressen geconsolideerd

  return new Promise(async (resolve, reject) => {
    const { dagenAdresTePakken } = await dagenDb.pakDagenData();

    if (!dagenAdresTePakken.length) {
      resolve("klaar");
      return;
    }

    let adressenDb = [];
    try {
      adressenDb = await pakOpslag("adressen");
    } catch (error) {
      // niets aan de hand, installatiecyclus
    }

    const alleGeconsolideerdeAdressenVol = adressenDb.map((a) => a.adres);

    // vinden welke adressen nog niet geconsolideerd zijn
    let teConsolideren = dagenAdresTePakken
      .map(async (dag) => {
        return await pakOpslag(`adressen/${dag}`);
      })
      .flat()
      .filter((a) => {
        return !alleGeconsolideerdeAdressenVol.includes(a.adres);
      });

    if (!teConsolideren.length) {
      resolve("klaar");
      return;
    }

    let nieuwGeconsolideerd = [].concat(adressenDb);
    const geoRequestsBekend = [];
    // voor alle te consolideren request doen of..
    if (!opties.overschrijfAlleRequest) {
      teConsolideren = teConsolideren.filter((adres) => {
        const bestandsNaam = geopadUitAdres(adres);
        if (fs.existsSync(bestandsNaam)) {
          geoRequestsBekend.push(JSON.parse(fs.readFileSync(bestandsNaam)));
          return false;
        } else {
          return true; // dus als bestand niet exist dan alsog requests doen.
        }
      });
      nieuwGeconsolideerd = nieuwGeconsolideerd.concat(geoRequestsBekend);
    }

    const geskiptWegensRateLimit = [];
    teConsolideren.forEach((c, index) => {
      setTimeout(function () {
        axios
          .get(
            "https://eu1.locationiq.com/v1/search.php?key=b7a32fa378c135&q=" +
              encodeURIComponent(`${c.plaatsnaam} ${c.straat}`) +
              "&format=json"
          )
          .then((r) => {
            schrijfOpslag(geopadUitAdres(c), r.data[0]);

            const iplus = index + 1;
            if (iplus % 25 === 0) {
              console.log(iplus, " adressen geconsolideerd");
            }
            const b = Object.assign(c, {
              lat: r.data[0].lat,
              lon: r.data[0].lon,
              osm_id: r.data[0].osm_id,
            });
            nieuwGeconsolideerd.push(b);
          })
          .catch((axiosErr) => {
            if (!axiosErr.response) {
              console.error(axiosErr);
              return;
            }

            if (axiosErr.response.status === 429) {
              geskiptWegensRateLimit.push(c);
              console.log("rate limit!");
            } else if (axiosErr.response.status === 404) {
              console.log("adres 404 faal", c.adres);
            }
          });
      }, index * 1111);
    });

    // na alle requests resolven...
    const exitTijd = teConsolideren.length * 1111 + 2000;
    console.log("Adressen klaar over", exitTijd / 60000, " minuten");
    setTimeout(function () {
      console.log("schrijf nieuw geonsolideerd");
      schrijfOpslag(opslagPad(`adressen`), nieuwGeconsolideerd);
      schrijfOpslag(opslagPad(`ratelimit-adressen`), geskiptWegensRateLimit);
      dagenDb.schrijfAdressenGepakt(dagenAdresTePakken);
      resolve("");
    }, exitTijd);
    s;
  });
}

async function zoekAdressen() {
  return new Promise(async (resolve, reject) => {
    const { dagenAdresTePakken } = await dagenDb.pakDagenData();

    // interval autovernietigd als alle dagen doorzocht
    // of langer dan 50s gewacht.
    let intervalTeller = 0;
    let resolveInterval = setInterval(function () {
      if (intervalTeller > 50) {
        clearInterval(resolveInterval);
        reject("DUURT LANG");
      }
      if (dagenAdresTePakken.filter((d) => !d.adresGepakt).length === 0) {
        clearInterval(resolveInterval);
        resolve(dagenAdresTePakken);
      } else {
        intervalTeller++;
      }
    }, 1000);

    try {
      dagenAdresTePakken.forEach((dagTeVerrijken, index) => {
        const draaiTijd = index * 800;
        setTimeout(async function () {
          ///////////////////////////
          //////////////////////////
          const pcClusters = await relevantePublicatieClusters(
            dagTeVerrijken.route
          );
          const allePublicatiesAlsString = pakPublicatiesEnSlaZePlat(
            pcClusters
          );
          const uniekeAdressen = uniekeAdressenUitString(
            allePublicatiesAlsString
          );
          /////////////////////
          ///////////////!!!!!!!!!/////
          dagTeVerrijken.adresGepakt = true;
          schrijfAdressenGepakt(
            `adressen/${dagTeVerrijken.route}`,
            uniekeAdressen
          );
        }, draaiTijd);
      });
    } catch (error) {
      clearInterval(resolveInterval);
      reject(error);
    }
  });
}

function uniekeAdressenUitString(pcString) {
  const w = pcString
    .join("")
    .split("vest.adr")
    .filter((s) => {
      // geen woonadressen of geheime;
      return !s.includes("woonadr") && !s.includes("eheim adres");
    })
    .map((s) => {
      const begintMetShit = s.substring(0, 2) === ". ";
      const eindigtMetShit = s.substring(s.length - 2, s.length) === ", ";
      if (begintMetShit && eindigtMetShit) {
        return s.substring(2, s.length - 2);
      } else if (begintMetShit) {
        return s.substring(2, s.length);
      } else if (eindigtMetShit) {
        return s.substring(0, s.length - 2);
      } else {
        return s;
      }
    })
    .map((s) => {
      return s.includes("corr.adr") ? s.split("corr.adr")[0] : s;
    })
    .map((s) => {
      return s.includes("KvK") ? s.split("KvK")[0] : s;
    })
    .map((s) => {
      return s.includes("Cur:") ? s.split("Cur:")[0] : s;
    });
  const regexMatches = w
    .map((s) => {
      const m = s.match(
        /(.+\d+\s?\w?)[,]?\s(\d{4}\s*[a-zA-Z]{2})[,]?\s([a-zA-z\-\'\s]*)[,.]+/
      );

      if (!m && !s.toLowerCase().includes("geheim adres")) {
        if (opties.volleDebug) {
          console.log("regex klopt niet voor", s);
        }
        return null;
      }

      // laatste meuk eraf... geen komma's enzo
      let mvol = m[0].trim();
      let l = mvol[mvol.length - 1];
      let vol = (l === "." ? mvol.substring(0, mvol.length - 1) : mvol)
        .trim()
        .replace(/\,/g, "");
      let postcode = m[2].replace(" ", "");
      return JSON.stringify({
        adres: vol,
        straat: m[1],
        postcode,
        plaatsnaam: m[3],
      });
    })
    .filter(function (value, index, self) {
      return self.indexOf(value) === index;
    })
    .map((json) => {
      return JSON.parse(json);
    })
    .filter((a) => a);

  return regexMatches;
}

function geopadUitAdres(adres) {
  return opslagPad(
    `responses/geo/${(adres.straat + adres.postcode).replace(/\W/g, "")}`
  );
}

function pakPublicatiesEnSlaZePlat(pcClusters) {
  try {
    return pcClusters
      .map((pcc) => {
        return pcc.Publicatiesoorten.map((ps) => {
          return ps.PublicatiesNaarLocatie.map((loc) => {
            return loc.Publicaties.join("");
          }).flat();
        }).flat();
      })
      .flat();
  } catch (error) {
    console.log("STRUCTUURVERWACHTING KLOPT NIET.");
    throw new Error(error);
  }
}

function relevantePublicatieClusters(route) {
  const toegestaneClusters = opties.toegestaneClusters;
  const ontoegestaneClusters = opties.ontoegestaneClusters;

  return new Promise(async (resolve, reject) => {
    try {
      const responseBestand = await pakOpslag(`responses/kvk/${route}`);
      const publicatieClusters = responseBestand.Instanties.map((instantie) => {
        return instantie.Publicatieclusters;
      })
        .flat()
        .filter((pc) => {
          const pco = pc.PublicatieclusterOmschrijving;
          if (toegestaneClusters.includes(pco)) {
            return true;
          } else if (!ontoegestaneClusters.includes(pco)) {
            console.log("pc cluster omschrijving onbekend: " + pco);
            return false;
          } else {
            return false;
          }
        });
      resolve(publicatieClusters);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  zoekAdressen,
  consolideerAdressen,
};
