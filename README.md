# ALISS Map embed

ALISS (A Local Information System for Scotland) is a national digital programme enabling people and professionals to find and share information on health and wellbeing resources, services, groups and support in their local communities and online. (https://www.aliss.org/).

aliss-map.js is a javascript plugin for anyone who wants to easily embed a map of selected ALISS services by category on their website. 

## Basic Usage
Include the Aliss Map embed code in your page and the Map and Service list will display. You can create this manually (see below for options) or use our simple map builder tool to create your embed code.

#### &rarr; [Use the map builder tool](https://66b4d3c4437cd415a2edf090--glittery-toffee-67851d.netlify.app/dist/index.html)

```html
  <div id="alissmap"></div>

  <script src="https://66b4d3c4437cd415a2edf090--glittery-toffee-67851d.netlify.app/demo/aliss-map.js" type="text/javascript" defer></script>
  <script>  
    alissMapConfig = {
      target: '#alissmap',
      defaultPostCode: 'G11AB',
      defaultLatLng: 55.86521,-4.2699,
      defaultSearchRadius: 10000,
      categories: children-and-families,community-resources,food-and-nutrition
    }
  </script>
  
```

## Manual usage

1. <a href="https://github.com/stuh/aliss-map/blob/master/demo/aliss-map.js" download>Download `aliss-map.js`</a>

2. Include the script on the header of the page where you want to use the plugin.

```
<script src="aliss-map.js"></script>
```

3. Create an HTML element on the page where you want to see the plugin appear

```
<div id="alissmap"></div>
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


## Options

Here are the available options you can add to your alissMapConfig object:

| Key  | Default Value  | Valid types | Description  |
|---|---|---|---|
| `target` | `'alissmap'` | String | the selector of the element where you want to add the map. |
| `defaultPostCode` | `'G11AB'` | String | The postcode that the alice search should center on. |
| `defaultLatLng` | `[55.86521, -4.26990]` | Array | An array of the Latitude and Longitude of the map's center |
| `defaultSearchRadius` | `10000` | Number | The default ALISS search radius |
| `categories` | `null` | Array | A mustache template used to produce HTML for the document. |

You can find the full list of categories including slugs via the [ALISS API](https://www.aliss.org/api/v4/categories/) or use our [map builder tool to create your embed](https://66b4d3c4437cd415a2edf090--glittery-toffee-67851d.netlify.app/dist/index.html).


## Links

[Demo page](https://66b4d3c4437cd415a2edf090--glittery-toffee-67851d.netlify.app/demo/) and [map builder tool](https://66b4d3c4437cd415a2edf090--glittery-toffee-67851d.netlify.app/dist/index.html).


## Links

- Production site: https://www.aliss.org
- Search API endpoint (v4): https://www.aliss.org/api/v4/search/
- API docs: http://docs.aliss.org
- API docs repo: https://github.com/aliss/Docs