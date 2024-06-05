export function getQueryParams() {
    const params: { [key: string]: string } = {};
    location.search
      .substr(1)
      .split("&")
      .forEach(function (item) {
        const [key, value] = item.split("=");
        params[key] = decodeURIComponent(value);
      });
    return params;
  }
  