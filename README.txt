# ALISS Map embed

ALISS (A Local Information System for Scotland) is a service to help you find help and support close to you when you need it most. You can read about the ALISS system here (https://www.aliss.org/).

aliss-map.js is a javascript plugin for anyone who wants to easily embed a map of selected ALISS services by category on their website. 

## Install

1. <a href="" download>Download `aliss-map.js`</a>

2. Include the script on the header of the page where you want to use the plugin.

```
<script src="aliss-map.js"></script>
```

3. Create an HTML element on the page where you want to see the plugin appear

```
<div id="aliss-target"></div>
```

4. Put this at the footer of the page with the new element

```
<script type="text/javascript">
  alissMapConfig = {
      target: '#alissmap',
      defaultPostCode: 'G11AB',
      defaultLatLng: [55.86521, -4.26990],
      defaultSearchRadius: 10000,
      categories: ['money', 'food-and-nutrition', 'community-resources']
  }
  </script>
```


## Install with Wordpress

1. Install the ["Insert Headers and Footers"](https://wordpress.org/plugins/insert-headers-and-footers/) wordpress plugin, or similar plugin which allows you to insert HTML `<script>` tags.

2. Upon activation, visit the `Settings » Insert Headers` and Footers page. You will see two boxes, one for the header and the other for the footer section.

3. Follow the [install instructions above](#install).



## Options

Here are the available options you can add to your alissMapConfig object:

| Key  | Default Value  | Valid types | Description  |
|---|---|---|---|
| `target` | `'alissmap'` | String | the selector of the element where you want to add the map. |
| `defaultPostCode` | `'G11AB'` | String | The postcode that the alice search should center on. |
| `defaultLatLng` | `[55.86521, -4.26990]` | Array | An array of the Latitude and Longitude of the map's center |
| `defaultSearchRadius` | `10000` | Number | The default ALISS search radius |
| `categories` | `null` | Array | A mustache template used to produce HTML for the document. |

You can find the full list of categories including slugs via the [ALISS API](https://www.aliss.org/api/v4/categories/).


## Demo

You can find [example code](https://glitch.com/~aliss-js), and a [demo](https://aliss-js.glitch.me/) on glitch.com.


## Plugin Development

PRs welcome!

Edit `src/aliss.js`, then build for production by running webpack cli:

`npx webpack --config webpack.config.js`


## Links

- Production site: https://www.aliss.org
- Search API endpoint (v4): https://www.aliss.org/api/v4/search/
- API docs: http://docs.aliss.org
- API docs repo: https://github.com/aliss/Docs