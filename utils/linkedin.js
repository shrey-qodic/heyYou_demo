import axios from "axios";

export const getPostIdFromUrl = async (url, cookie, csrfToken) => {
  const m =
    /^https:\/\/www.linkedin.com\/(feed\/update\/(?:urn:li:)?|posts\/(?:.*?)?)(activity|ugcPost)[-:]([0-9]{10,100})/.exec(
      url
    );
  if (!m) return undefined;

  const rootPath = m[1];
  const type = m[2];
  const id = m[3];
  //   console.log(rootPath, type, id);
  if (type === "activity") return id;

  let getUrl = "/voyager/api/feed/updatesV2?moduleKey=feed-item%3Adesktop&";

  if (rootPath.indexOf("posts") === 0) {
    const path = url.split("/");
    const slug = path[path.length - 2];

    getUrl += `q=postSlug&slug=${encodeURIComponent(slug)}`;
  } else {
    getUrl += `q=backendUrnOrNss&urnOrNss=${encodeURIComponent(
      `urn:li:${type}:${id}`
    )}`;
  }

  let fullData;

  try {
    fullData = await axios.get(`https://www.linkedin.com${getUrl}`, {
      headers: {
        referer: url,
        cookie: cookie,
        "csrf-token": csrfToken,
        origin: "https://www.linkedin.com",
        authority: "www.linkedin.com",
        "x-requested-with": "XMLHttpRequest",
        "x-restli-protocol-version": "2.0.0",
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "user-agent": process.env.DEFAULT_USER_AGENT,
        "x-li-track":
          '{"clientVersion":"1.5.*","osName":"web","timezoneOffset":2,"deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
      },
    });
    console.log("========================== fullData ======================");
    console.log(fullData);
    if (!fullData) return undefined;
  } catch (err) {
    console.log("getPostIdFromUrl: failed to get info from ugcPost", {
      type,
      id,
      url,
      err,
    });
    return undefined;
  }

  return null;
};

export const checkPostUrl = (url) => {
  return /^https:\/\/www.linkedin.com\/(?:feed\/update\/(?:urn:li:)?(?:activity|ugcPost):|posts\/(?:.*?)?(?:activity|ugcPost)-)([0-9]{19})(?:-[\w-_]{4})?\/?(\?.*)?$/.test(
    url
  );
};
