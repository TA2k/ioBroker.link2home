"use strict";

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios").default;
const Json2iob = require("./lib/json2iob");
const crypto = require("crypto");
const qs = require("qs");

class Link2home extends utils.Adapter {
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  constructor(options) {
    super({
      ...options,
      name: "link2home",
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.deviceArray = [];

    this.updateInterval = null;
    this.reLoginTimeout = null;
    this.refreshTokenTimeout = null;
    this.session = {};
    this.json2iob = new Json2iob(this);
    this.requestClient = axios.create();
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    // Reset the connection indicator during startup
    this.setState("info.connection", false, true);
    if (this.config.interval < 0.5) {
      this.log.info("Set interval to minimum 0.5");
      this.config.interval = 0.5;
    }
    if (!this.config.username || !this.config.password) {
      this.log.error("Please set username and password in the instance settings");
      return;
    }

    this.subscribeStates("*");

    this.log.info("Login to Link2Home");
    await this.login();
    if (this.session.token) {
      await this.getDeviceList();
      await this.updateDevices();
      this.updateInterval = setInterval(async () => {
        await this.updateDevices();
      }, this.config.interval * 60 * 1000);
    }
    this.refreshTokenInterval = setInterval(() => {
      this.refreshToken();
    }, 12 * 60 * 60 * 1000);
  }
  async login() {
    const data = {
      appName: "Link2Home",
      appType: "2",
      appVersion: "1.1.1",
      password: crypto.createHash("md5").update(this.config.password).digest("hex"),
      phoneSysVersion: "iOS 16.1.1",
      phoneType: "iPhone 14",
      username: this.config.username,
    };
    const sign = this.createSign(data);
    data.sign = sign;
    await this.requestClient({
      method: "post",
      url: "https://userdata.link2home.com/api/service/user/login",
      headers: {
        Accept: "*/*",
        "User-Agent": "Link2Home/1.1.1 (iPhone; iOS 16.1.1; Scale/3.00)",
        "Accept-Language": "de-DE;q=1, uk-DE;q=0.9, en-DE;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: qs.stringify(data),
    })
      .then((res) => {
        this.log.debug(JSON.stringify(res.data));
        if (res.data.data) {
          this.log.info("Login successful");
          this.session = res.data.data;
          this.setState("info.connection", true, true);
        }
      })
      .catch((error) => {
        this.log.error(error);
        this.log.error("Login failed");
        error.response && this.log.error(JSON.stringify(error.response.data));
      });
  }

  createSign(data) {
    const ordered = Object.keys(data)
      .sort()
      .reduce((obj, key) => {
        obj[key] = data[key];
        return obj;
      }, {});
    const string = qs.stringify(ordered, { encode: false });

    const privateKeyHash =
      "308204BD020100300D06092A864886F70D0101010500048204A7308204A30201000282010100829C8319985E2B93D5660F597D2C8E62E0A41B00F64CC418E90DD91BADD786AABCBF3622054F72711BD6C9CB56B8EBE29BD466221C3677F38C1F56000B6A6C3F105A52AC747EAE59BECCB0032FA100CCBE1DC701F7D14556730D61D5121D62D4972A6D9EA7FFB7AB3C500E6C8E6BAE98380E2240A7D197FFA57DA42F59E0735FBA8526FFFA12363456E6CE3633DE792FDB8DFDFC09693C1B14862BC6281815AFB6234EE56D3B033939FCA66DEADD13ED349C0FB1F29D9341C15934E1055231F5D658AEAF5F15CFA5CDAC294C9B899A1F302B7A7C2D6A8A846D14ADE727140CE3C33C7DCED1D037F477B7331BF6409A42CF7AEF1407E09CFAD3BB07477B3AE7F30203010001028201000B055DE29902C9368E39306E62AB91D0321866D6EBF18A5277C7DD5C028D3F25C50B756BE57AD0B34EA00F23034C534B29CF00573C7E341CEEE3EE03CEF2C9F38053BECA228255FFE8A3A8EE7BE46006E6BBE880F802469186DFC8338C75C25321F6488DACAB5D3A2BBAAD9CE75F9AB9E970F7DEF0CA34C33399A872FE687C13A68CA926C16D7DF34B337131E9FC96482920E97316564EDC262A6492F188FB52B476573B857A0F2EE3E2CC84C98E4B2E60A9FCCA7CBA4CFD9038F1728C721E3F651CCED9F1868F41B520BF42E7E617554A05753C6A82CC07F23FF0ACC78014C3DE1B7D49B76FDA221016F7E2804E60FF4DC0CF8DA05715D83EE7CD739FEA048102818100D6D67CDBE9FF73EB49B8F81C74C30DCC95F3642A3D2398DE27352E8E3CE79BFED4673B2D0E7D48313BEA176E67BC14CC6AF3A37FACB48A0DC41891AAE2E96BCC116A70A3F2CEEE8B90B5E7CC7658DBFA0BA869EC878EA1BBD0DDD246A0F8EDFCC528E6210672C912D0159E7E2244E80CF1FD92E98B9F672F9B449C6EA6B39C13028181009BA2D3D4E0027E1B135925F07DB7E09121134E5CAFC8975DA7AAABAE54BDA10DF0C71BDFC761F289EEFED1ADD9175563161DF07ACA458AD4626CE8ACA63881358EAA789DE05B3644E7056C0378906B66E893061AD0F2A90CD540A1145737B7ABE1DE1B1853C393458B6FF4A713EB573692364942198674B0CC81537303DB40A1028180261779A3F4655AC4491A06C3E4E000BE598802268B1898AE2AFD7EF7B14CCF97EB493270D6B4D7EC02D78AB804A4907B7E2B1CBE327D004D588B92A85DFB4D25ADA0D5BFFBF93CCA7A2A06A3760863587E60AA074A31BBF375211F7B6E6734AB30BA03B3AF5502D9D7133E3AD710A8A442F3D6EC99D8F58EB754FEF78F8F21090281803B10C8A3F97FF8ABFDE3CF6A3DCC1306012F7A85E29096218D0850AF90A986FDEB6B2541004243F1E52A0019A25220ADC22F0A9D0F36E54145395FF46600FBC87FA462B247FB55D54077E64E4AEB445781DC8A6C92F0050841C68D5B52DE6A6E690209F66993C7C894EAA046E8606070ED7C7CC1013EEDFA4B22A9B0F4BDB90102818100BA638FDCB02F73D5883AE5F3AB958218844CA306E926E0ED550280A57EE7E5560B7FAFDC51609C757FF03C3BF9C13A34FB440FB862FF14F33ECCA3880D5E609CA40E30F61A255A5CB9DD87EB72FB6B83B4FC8517F2542E119922F4694C10C906442F3EED696D01D7FDFA1346E9D8E28859CC75D58E17B7F7730500A3066F9707";

    const sign = crypto.createSign("rsa-sha1");
    sign.update(string);
    const signature = sign.sign({ key: Buffer.from(privateKeyHash, "hex"), format: "der", type: "pkcs8" }, "base64");

    return signature;
  }
  async getDeviceList() {
    const data = { token: this.session.token };
    data["sign"] = this.createSign(data);

    await this.requestClient({
      method: "get",
      url: "https://userdata.link2home.com/api/app/device/list?" + qs.stringify(data),
      headers: {
        Accept: "*/*",
        "Accept-Language": "de-DE;q=1, uk-DE;q=0.9, en-DE;q=0.8",
        "User-Agent": "Link2Home/1.1.1 (iPhone; iOS 16.1.1; Scale/3.00)",
      },
    })
      .then(async (res) => {
        this.log.debug(JSON.stringify(res.data));
        if (res.data.data) {
          this.log.info(`Found ${res.data.data.length} devices`);
          for (const device of res.data.data) {
            this.log.debug(JSON.stringify(device));
            const id = device.macAddress;

            this.deviceArray.push(device);
            const name = device.deviceName;

            await this.setObjectNotExistsAsync(id, {
              type: "device",
              common: {
                name: name,
              },
              native: {},
            });
            await this.setObjectNotExistsAsync(id + ".remote", {
              type: "channel",
              common: {
                name: "Remote Controls",
              },
              native: {},
            });

            const remoteArray = [{ command: "Refresh", name: "True = Refresh" }];
            remoteArray.forEach((remote) => {
              this.setObjectNotExists(id + ".remote." + remote.command, {
                type: "state",
                common: {
                  name: remote.name || "",
                  type: remote.type || "boolean",
                  role: remote.role || "boolean",
                  def: remote.def || false,
                  write: true,
                  read: true,
                },
                native: {},
              });
            });
            this.json2iob.parse(id + ".general", device, { forceIndex: true });
          }
        }
      })
      .catch((error) => {
        this.log.error(error);
        error.response && this.log.error(JSON.stringify(error.response.data));
      });
  }

  async updateDevices() {
    const statusArray = [
      {
        url: "",
        path: "status",
        desc: "Status of the device",
      },
    ];

    for (const element of statusArray) {
      for (const device of this.deviceArray) {
        // const url = element.url.replace("$id", id);

        await this.requestClient({
          method: "post",
          url: element.url,
          headers: {
            "content-type": "application/json",
            "user-agent": "ioBroker",
            accept: "*/*",
          },
          data: "",
        })
          .then(async (res) => {
            this.log.debug(JSON.stringify(res.data));
            if (!res.data) {
              return;
            }
            if (res.data.code != 0) {
              this.log.error(JSON.stringify(res.data));
              return;
            }
            let data = res.data.result;
            if (data.result) {
              data = data.result;
            }

            const forceIndex = true;
            const preferedArrayName = null;

            this.json2iob.parse(device.cid + "." + element.path, data, {
              forceIndex: forceIndex,
              write: true,
              preferedArrayName: preferedArrayName,
              channelName: element.desc,
            });
            // await this.setObjectNotExistsAsync(element.path + ".json", {
            //   type: "state",
            //   common: {
            //     name: "Raw JSON",
            //     write: false,
            //     read: true,
            //     type: "string",
            //     role: "json",
            //   },
            //   native: {},
            // });
            // this.setState(element.path + ".json", JSON.stringify(data), true);
          })
          .catch((error) => {
            if (error.response) {
              if (error.response.status === 401) {
                error.response && this.log.debug(JSON.stringify(error.response.data));
                this.log.info(element.path + " receive 401 error. Refresh Token in 60 seconds");
                this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
                this.refreshTokenTimeout = setTimeout(() => {
                  this.refreshToken();
                }, 1000 * 60);

                return;
              }
            }
            this.log.error(element.url);
            this.log.error(error);
            error.response && this.log.error(JSON.stringify(error.response.data));
          });
      }
    }
  }

  async refreshToken() {
    this.log.debug("Refresh token");
    await this.login();
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   * @param {() => void} callback
   */
  onUnload(callback) {
    try {
      this.setState("info.connection", false, true);
      this.refreshTimeout && clearTimeout(this.refreshTimeout);
      this.reLoginTimeout && clearTimeout(this.reLoginTimeout);
      this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
      this.updateInterval && clearInterval(this.updateInterval);
      this.refreshTokenInterval && clearInterval(this.refreshTokenInterval);
      callback();
    } catch (e) {
      callback();
    }
  }

  /**
   * Is called if a subscribed state changes
   * @param {string} id
   * @param {ioBroker.State | null | undefined} state
   */
  async onStateChange(id, state) {
    if (state) {
      if (!state.ack) {
        const deviceId = id.split(".")[2];
        let command = id.split(".")[4];
        const type = command.split("-")[1];
        command = command.split("-")[0];

        if (id.split(".")[4] === "Refresh") {
          this.updateDevices();
          return;
        }

        await this.requestClient({
          method: "post",
        })
          .then((res) => {
            this.log.info(JSON.stringify(res.data));
          })
          .catch(async (error) => {
            this.log.error(error);
            error.response && this.log.error(JSON.stringify(error.response.data));
          });
        this.refreshTimeout = setTimeout(async () => {
          this.log.info("Update devices");
          await this.updateDevices();
        }, 10 * 1000);
      } else {
        const resultDict = {
          auto_target_humidity: "setTargetHumidity",
          enabled: "setSwitch",
          display: "setDisplay",
          child_lock: "setChildLock",
          level: "setLevel-wind",
        };
        const idArray = id.split(".");
        const stateName = idArray[idArray.length - 1];
        const deviceId = id.split(".")[2];
        if (resultDict[stateName]) {
          const value = state.val;
          await this.setStateAsync(deviceId + ".remote." + resultDict[stateName], value, true);
        }
      }
    }
  }
}

if (require.main !== module) {
  // Export the constructor in compact mode
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  module.exports = (options) => new Link2home(options);
} else {
  // otherwise start the instance directly
  new Link2home();
}
