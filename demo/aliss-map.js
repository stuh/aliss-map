

let alissDefaults = {}


let postCodeToLatLngHistory = {}; // used as a cache to hold any previously fetched latlng from the api. 
let markersLayer = ''; // global markersLayer to hold the markers
let map = ''; // global map to hold the map
let search_button; // ref to the search button
let postcode_field; // ref to the postcode field
let query_field; // ref to the query field
let output_msg; // ref to the output message div
let results_list; // ref to the results list div



const doPostCodeSearch = () => {
  // clear any previous errors and error styles
  output_msg.textContent = '';
  postcode_field.classList.remove('search-error');

  // the postcoe regex
  rePostCode = /^(([Gg][Ii][Rr] 0[Aa]{2})|((([A-Za-z][0-9]{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y][0-9]{1,2})|(([A-Za-z][0-9][A-Za-z])|([A-Za-z][A-Ha-hJ-Yj-y][0-9]?[A-Za-z]))))\s?[0-9][A-Za-z]{2}))$/;

  // do the test
  const postCodeOk = rePostCode.test(getPostCode());

  // if not a good postcode then show the error with styles and stop.
  if (!postCodeOk) {
    output_msg.textContent = 'Please enter a valid postcode';
    postcode_field.classList.add('search-error');
    return;
  }
  // if it's ok then lets go
  doSearch();
}




// add listener to the location links, we listen to document clicks
// as these links are dynamically created after load
document.addEventListener('click', function(e){
  // if this is a location-map-link in the .results-list div then...
  if(e.target && e.target.parentNode.classList== 'location-map-link' && e.target.parentNode.parentNode.parentNode.parentNode.classList == 'results-list'){

    // zoom in and center the map on this services latlng
    map.setView([e.target.parentNode.dataset.lat, e.target.parentNode.dataset.lng], 17);
    
    // get the offset of the map
    const offsetTop = document.querySelector('.map-holder').offsetTop - 30;

    // scroll to the map
    scroll({
      top: offsetTop,
      behavior: "smooth"
    });

  }
});

// get the chosen category, default to food-and-nutrition
const getSelectedCategory = () => {
  const category = document.querySelector('input[name="category"]:checked')?.value || 'food-and-nutrition';
  return category;
}

// get the postcode
const getPostCode = () => {
  return postcode_field.value || alissDefaults.defaultPostCode ;
}

// get the query
const getQuery = () => {
  return query_field.value || '' ;
}

// getServices function which grabs the services from ALISS and returns a services Array of Objects
const getServices = async (baseurl) => {
  // set some variables
  // set the parameters
  const postCode = getPostCode();
  const pclatlng = await getLatLngFromPostCode(postCode)
  const q = getQuery();
  const category = getSelectedCategory();
  const radius = alissDefaults.defaultSearchRadius;
  // category might have multiple comma seperated valueds so we need to split them into an array, eg. food-and-nutrition, money
  const categoryArray = getSelectedCategory().split(',');
  // we can then loop through the categories and add them all the services for each one to the services array
  let services = [];
  for (const cat of categoryArray) {
    // set the baseUrl
    const baseUrl = `${baseurl}?lat=${pclatlng[0]}&ln=${pclatlng[1]}&q=${q}&category=${cat}&postcode=${postCode}&page_size=1000&radius=${radius}&format=json&page=`;
    // const baseUrl = `/memberslist?q=${q}&category=${category}&postcode=${postCode}&page_size=1000&radius=${radius}&format=json&page=`;

    // set first page
    let page = 1;
    // create empty array where we want to store the services objects for each loop
    
    // create a lastResult array which is going to be used to check if there is a next page
    let lastResult = [];
    do {
      // try catch to catch any errors in the async api call
      try {
        // use fetch to make api call
        const resp = await fetch(`${baseUrl}${page}`);
        const data = await resp.json();
        lastResult = data;
        const count = data.count;
        data.data.forEach(service => {
          // destructure the services object and add to array
          const { name, gcfn, description, locations, url, phone, email, organisation } = service;
          // for each service calulcate its distance from the currently searched postcode, we'll sort by this later when building the card list below the map
          const distance = getDistanceFromLatLonInKm(pclatlng[0], pclatlng[1], locations[0]?.latitude || 0, locations[0]?.longitude || 0)
          // add the object to the services Array
          services.push({ name, gcfn, description, locations, url, phone, email, organisation, distance });
        });
        // increment the page with 1 on each loop
        page++;
      } catch (err) {
        console.error(`Oops, something is wrong ${err}${page}`);
        break;
      }
      // keep running until there's no next page or if count is 0
    } while (lastResult.next !== null && lastResult.count > 0);
  };
  // let's return the services array of objects
  return services;

}


//function to take the services array. We iterate each service to add a marker to the markersLayer LayerGroup
const addMarkersToMap = (services) => {


// if we already have a layer group, clear it of Markers.
if (map.hasLayer(markersLayer)) {
  markersLayer.clearLayers();
}

// for each service build the popup and then add to the layerGroup
services.forEach(service => {
  if (service.locations.length > 0) {

    service.locations.forEach(location => {
      // build the html servicecard but use the override feature for each location
      let serviceCard = buildServiceCard(service, location);
      // add the marker if it has a latlng
      if (location.latitude && location.longitude) {
        L.marker([location.latitude, location.longitude]).bindPopup(serviceCard).bindTooltip(`<strong>${service.name}</strong><br/>${location.street_address}<br/>${location.locality}`).addTo(markersLayer);
      }
      // add latlng to the array to be used to set the bonds of the map
      // arrayOfLatLngs.push([location.latitude, location.longitude]);

    });
  }
})

// set the bounds of the map and add make the map fit the bounds 
// TODO not using as some outliers have wacky latlng compared to the postcode search they are part of - the result is the map always zoooms way out.
// var bounds = new L.LatLngBounds(arrayOfLatLngs);
// map.fitBounds(bounds);
}

// this builds the html for a service to be used in both the map popup and list, keeps it the same.
// the only difference is that some services have multiple locations, when this is the case we dont want to list them all on the
// map popup as its confusing, so we have a locationOverride parameter that lets us replace the array of objects with a single object instead.
// you can see this called in the addMarkersToMap() function
const buildServiceCard = (service, locationOverride) => {

  let serviceCard = document.createElement('div');
  serviceCard.className = "service-card";

  
  let serviceTitle = document.createElement('h3');
  serviceTitle.className = "service-title";
  serviceTitle.innerHTML = service.name;
  serviceCard.appendChild(serviceTitle);
  

  let serviceOrg = document.createElement('div');
  serviceOrg.className = "service-org";
  if (service.organisation.aliss_url) {
    serviceOrg.innerHTML = `By <a href="${service.organisation.aliss_url}" target="_blank">${service.organisation.name}</a>`;
  } else {
    serviceOrg.innerHTML = `By ${service.organisation.name}`;
  }
  serviceCard.appendChild(serviceOrg);
  
  // some services have no location so we dont show a distance for these.
  if (service.distance < 1000) {
    let serviceDistance = document.createElement('span');
    serviceDistance.className = "service-distance";
    serviceDistance.innerHTML = service.distance.toFixed(2) + 'km away';
    serviceCard.appendChild(serviceDistance);
  }

  let serviceDescription = document.createElement('div');
  serviceDescription.className = "service-description";
  serviceDescription.innerHTML = service.description;
  serviceCard.appendChild(serviceDescription);

  let serviceLocations = document.createElement('div');
  serviceLocations.className = "service-locations";

  // here we can swap out the services.locations for a single injected location for popups
  let locations = [];
  if (locationOverride) {
    locations = [locationOverride];
  } else {
    locations = service.locations;
  }
  // carry on with the loop een if its only for an array of length 1
  locations.forEach(location => {
    let locationText = document.createElement('span');
    // if location has a latitute and longitude then we can add a link to the map
      locationText.innerHTML = `<span>${location.formatted_address}</span> <svg class="pinsvg" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 10c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2m0-5c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3m-7 2.602c0-3.517 3.271-6.602 7-6.602s7 3.085 7 6.602c0 3.455-2.563 7.543-7 14.527-4.489-7.073-7-11.072-7-14.527m7-7.602c-4.198 0-8 3.403-8 7.602 0 4.198 3.469 9.21 8 16.398 4.531-7.188 8-12.2 8-16.398 0-4.199-3.801-7.602-8-7.602"/></svg>`;
    if (location.latitude && location.longitude) {
      locationText.className = "location-map-link";
      locationText.dataset.lat = location.latitude;
      locationText.dataset.lng = location.longitude;
    } else {
      locationText.className = "location-text";
    }
    serviceLocations.appendChild(locationText);
  });
  serviceCard.appendChild(serviceLocations);



  let serviceLinks = document.createElement('div');
  serviceLinks.className = "service-links";
  serviceCard.appendChild(serviceLinks);


  if (service.url) {
    let serviceUrl = document.createElement('a');
    serviceUrl.className = "service-url";
    serviceUrl.href = service.url;
    serviceUrl.target = '_blank';
    serviceUrl.innerHTML = 'Visit the website';
    serviceLinks.appendChild(serviceUrl);
  }

  if (service.phone) {
    let servicePhone = document.createElement('a');
    servicePhone.className = "service-phone";
    servicePhone.href = `tel:${service.phone}`;
    servicePhone.target = '_blank';
    servicePhone.innerHTML = service.phone;
    serviceLinks.appendChild(servicePhone);
  }
  
  if (service.email) {
    let serviceEmail = document.createElement('a');
    serviceEmail.className = "service-email";
    serviceEmail.href = `mailto:${service.email}`;
    serviceEmail.target = '_blank';
    serviceEmail.innerHTML = service.email;
    serviceLinks.appendChild(serviceEmail);
  }

  return serviceCard;
}

const buildResultsList = (services) => {

results_list.innerHTML = '';

services.forEach( service => {
  
  let serviceCard = buildServiceCard(service);
  results_list.appendChild(serviceCard);

});

}

// center the map on the postcode (with caching of geolocation api results)
const centerMapOnPostcode = async () => {

// get the entered postcode value
const postcode = getPostCode()

// if it's the default, we know this so don't use the API, just return our default latlng
if (postcode == alissDefaults.defaultPostCode) {
  // now center the map
  map.setView(alissDefaults.defaultLatLng, 12);
  return
}

// if it's not the default or a previously fetched postcode, grab it from the API...
const apilatlng = await getLatLngFromPostCode(postcode);

// now center the map
map.setView(apilatlng, 12);
}

const getLatLngFromPostCode = async (postcode) => {

// if this postcode is in the cache then just return that instead of using the api
if (postCodeToLatLngHistory[postcode]) {
  return postCodeToLatLngHistory[postcode]
}

//if its a new one then lests return it from the api and cache the result
const postcodeApiUrl = 'https://api.getthedata.com/postcode/'

try {
      // use fetch to make api call
      const resp = await fetch(`${postcodeApiUrl}${postcode}`);
      const data = await resp.json();
      const status = data.status;

      if (status == 'match') {
        // if a match is found then first cache it
        postCodeToLatLngHistory[postcode] = [data.data.latitude, data.data.longitude];
        // then return it
        return [data.data.latitude, data.data.longitude];
      } else {
        return alissDefaults.defaultLatLng;
      }
      
    } catch (err) {
      console.error(`Oops, something is wrong ${err}`);
      return alissDefaults.defaultLatLng;
    }

}

// do the search
async function doSearch() {
//ref to loader
const loader = document.querySelector('.aliss-map-loader');

// show the loader
loader.classList.remove('load-hide');

// get all the services from the API into an arrayOfObjects
const servicesList = await getServices('https://api.aliss.org/v4/services/');

// now sort them but distance into a new arrayOfObjects
const sortedArray = servicesList.sort((a, b) => {  
  return a.distance >= b.distance
      ? 1
      : -1
  })

// add markers to the map
addMarkersToMap(sortedArray);
centerMapOnPostcode();

// show results list
buildResultsList(sortedArray);

// hide the loader
loader.classList.add('load-hide');
}

// use these to get the distance betweem two latlngs
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
var R = 6371; // Radius of the earth in km
var dLat = deg2rad(lat2-lat1);  // deg2rad below
var dLon = deg2rad(lon2-lon1); 
var a = 
  Math.sin(dLat/2) * Math.sin(dLat/2) +
  Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
  Math.sin(dLon/2) * Math.sin(dLon/2)
  ; 
var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
var d = R * c; // Distance in km
return d;
}

function deg2rad(deg) {
return deg * (Math.PI/180)
}

// add css to the page
const addCSSFile = (url) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = url;
  document.head.appendChild(link);
}

// add js to the page
// Function to load an external JS file
const loadLeafletJS = (callback) => {
  var script = document.createElement('script');
  script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  script.crossOrigin = "";
  script.onload = callback;
  document.head.appendChild(script);
}

const createLoaderSVG = () => {
// Create the SVG namespace
const svgns = "http://www.w3.org/2000/svg";

// Create an SVG element
const svg = document.createElementNS(svgns, "svg");
svg.setAttribute("width", "120");
svg.setAttribute("height", "30");
svg.setAttribute("viewBox", "0 0 120 30");
svg.setAttribute("fill", "#000");

// Function to create a circle with animations
function createCircle(cx, cy, r, rValues, opacityValues) {
  const circle = document.createElementNS(svgns, "circle");
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", cy);
  circle.setAttribute("r", r);
  circle.setAttribute("fill-opacity", opacityValues.split(';')[0]); // Initial opacity

  const animateR = document.createElementNS(svgns, "animate");
  animateR.setAttribute("attributeName", "r");
  animateR.setAttribute("from", r);
  animateR.setAttribute("to", r);
  animateR.setAttribute("begin", "0s");
  animateR.setAttribute("dur", "0.8s");
  animateR.setAttribute("values", rValues);
  animateR.setAttribute("calcMode", "linear");
  animateR.setAttribute("repeatCount", "indefinite");

  const animateOpacity = document.createElementNS(svgns, "animate");
  animateOpacity.setAttribute("attributeName", "fill-opacity");
  animateOpacity.setAttribute("from", opacityValues.split(';')[0]);
  animateOpacity.setAttribute("to", opacityValues.split(';')[0]);
  animateOpacity.setAttribute("begin", "0s");
  animateOpacity.setAttribute("dur", "0.8s");
  animateOpacity.setAttribute("values", opacityValues);
  animateOpacity.setAttribute("calcMode", "linear");
  animateOpacity.setAttribute("repeatCount", "indefinite");

  circle.appendChild(animateR);
  circle.appendChild(animateOpacity);

  return circle;
}

// Create circles with animations
const circle1 = createCircle("15", "15", "15", "15;9;15", "1;.5;1");
const circle2 = createCircle("60", "15", "9", "9;15;9", ".5;1;.5");
const circle3 = createCircle("105", "15", "15", "15;9;15", "1;.5;1");

// Append circles to the SVG element
svg.appendChild(circle1);
svg.appendChild(circle2);
svg.appendChild(circle3);

// Append the SVG element to the container div
document.querySelector('.aliss-map-loader').appendChild(svg);

}

const buildLayout = (targetNode) => {

// Create the section element
      const section = document.createElement('section');
      section.className = 'aliss-map';

      // Add the inner HTML content
      section.innerHTML = `
          <div class="aliss-map-loader"></div>

          <div class="aliss-map-search">
              <input type="search" name="aliss-postcode" id="aliss-postcode" placeholder="Enter your postcode">
              <input type="search" name="aliss-q" id="aliss-q" placeholder="filter by keyword">
              <button class="aliss-search-button">Submit</button>
          </div>

          <div class="output-message"></div>

          <div class="aliss-map-categories">
              
          </div>

          <div class="map-holder">
              <div id="map"></div>
          </div>
          <div class="results-list"></div>
      `;

      // Append the section to a container in the existing HTML
      document.querySelector(targetNode).appendChild(section);

}

// buulds and adds the configured categories to the filter buttons
const buildCategoryRadioButtons = (categories) => {
  
  // clear the aliss-map-categories div
  document.querySelector('.aliss-map-categories').innerHTML = '';

  // for each category in categories add a radio button to .aliss-map-categories
  const mapCategories = document.querySelector('.aliss-map-categories');
  categories.forEach(category => {
    let input = document.createElement('input');
    input.type = 'radio';
    input.name = 'category';
    input.id = category;
    input.value = category;
    let label = document.createElement('label');
    label.htmlFor = category;
    label.innerHTML = category.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    mapCategories.appendChild(input);
    mapCategories.appendChild(label);
  });

  // create the all button
  let input = document.createElement('input');
  input.type = 'radio';
  input.name = 'category';
  input.id = 'all';
  input.value = categories.join(',');
  input.checked = true;
  let label = document.createElement('label');
  label.htmlFor = 'all';
  label.innerHTML = 'All';
  mapCategories.prepend(label);
  mapCategories.prepend(input);


  // add listener to the radio buttons
  document.querySelectorAll('input[name="category"]').forEach((elem) => {
    elem.addEventListener("change", function(event) {
      console.log('category changed');
      doSearch();
    });
  });

}

// include some css in a style tag in the head
const style = document.createElement('style');
style.innerHTML = `
      #map { 
        height: 40vh; 
        min-height:450px;
      }
      @media (min-width: 45em) {
        #map { 
          height: 40vh; 
          min-height:350px;
        }
      }
     .aliss-map .aliss-map-loader { 
        position:absolute;
        top:0;
        left:0;
        right:0;
        bottom:0;
        z-index:1000;
        display:flex;
        justify-content:center;
        align-items:center;
        width:100%;
        height:100vh;
        background: rgba(255, 255, 255, .5);
      }
      .aliss-map{
        font-family: "sofia-pro", sans-serif;;
      }

      .aliss-map  .aliss-map-search{
        padding:10px 0 20px;   
      }
      .aliss-map  #aliss-postcode, .aliss-map #aliss-q{
        width:auto;
        display:inline-block;
        margin-bottom:0;
        border:1px solid #212121;
        padding:10px;
      }
      .aliss-map  .aliss-search-button{
        padding: 0.6em 0.5em;
        font-size: 20px;
        min-width: 150px;
        color: #fff;
        margin: 5px 0 0;
        font-family: "sofia-pro", sans-serif;;
        font-weight: 400;
        transition: color .3s ease-in-out;
        border: 2px solid transparent;
        position: relative;
        background-color:#004785;

      }
      .aliss-map  .aliss-search-button:hover{
        background-color:#212121;
        

      }
      .aliss-map .aliss-map-categories{
        margin-bottom:10px;
        /* margin-left:20px; */
        display:flex;
        align-items:center;
        flex-wrap: wrap;
      }
      .aliss-map .aliss-map-categories label{
        padding:0 10px 0 5px;

      }

      .aliss-map h3.service-title{
        margin-bottom:0;
      }
      .aliss-map span.service-distance{
        display:none;
      }
      .aliss-map .service-description{
        
        margin-top:15px;
        margin-bottom:15px;
      }
      
      .aliss-map .service-links a{
        display:block;
        padding:5px 10px 5px 0;
      }
      .aliss-map .location-map-link .pinsvg{
        display:none;
      }
      .aliss-map .results-list {
        max-height: 50vh;
        overflow-y: auto;
      }
      .aliss-map .results-list .service-links{
        display:flex;
      }
      .aliss-map .results-list .service-card{
        position:relative;
        margin-bottom:40px;
        margin-top:40px;
        background:#f0f4f9;
        padding:20px;

      }
      .aliss-map .results-list .service-distance{
        font-size:0.8rem;
        font-weight:bold;
        display:block;
      }
      
      .aliss-map .results-list .location-map-link .pinsvg{
        display:inline-block;
        margin-right:7px;
      }
      .aliss-map .results-list .location-map-link{
        cursor:pointer;
        display:flex;
        flex-direction: row-reverse;
        justify-content: flex-end;
        padding-bottom:5px;
        text-decoration:underline;

      }
      .aliss-map .results-list .location-text{
        display:flex;
        flex-direction: row-reverse;
        justify-content: flex-end;
        padding-bottom:5px;

      }

      .aliss-map .results-list .service-links{
        margin-top:5px;
      }

      .aliss-map .load-hide{
        display:none;
      }
      
      .aliss-map .output-message{
        color:red;
        padding:2px 0;
        margin-top:-20px;
        margin-bottom:10px;
      }
      .aliss-map .output-message:empty{
        display:none;
        
      }
      .aliss-map .search-error{
        background: #ec8c8c;
      }
      .aliss-map .aliss-sub-link{
        color:#e49611;
        cursor:pointer;
        text-decoration:underline;
      }
      .aliss-map .aliss-sub-link:hover{
        color: #005231;
      }

      `
document.head.appendChild(style);


// lets begin
// add the leaflet css
addCSSFile('https://unpkg.com/leaflet@1.9.2/dist/leaflet.css');

// load the leaflet js and callback the createBaseMap function to build the default map

// init the widget
const initALISSMap = () => {
  // set the defaults
  alissDefaults = {
    ...alissMapConfig
  }

  // build basic layout
  buildLayout(alissMapConfig.target);

  // create and turn on the loader
  createLoaderSVG();

  // create the base map
    map = L.map('map').setView(alissDefaults.defaultLatLng, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: `&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy <a href="https://www.ons.gov.uk/methodology/geography/licences">Crown copyright and database right ${new Date().getFullYear()}</a> `
  }).addTo(map);
  // create a map layer to hold the markers
    markersLayer = L.layerGroup();
  // add it to the map
  map.addLayer(markersLayer);

  


  // reference the search button
  search_button = document.querySelector('.aliss-search-button');
  // reference the postcode_field
  postcode_field = document.querySelector('#aliss-postcode');
  // reference the query field
  query_field = document.querySelector('#aliss-q');
  // reference the output div
  output_msg = document.querySelector('.output-message')
  // reference the results list
  results_list = document.querySelector('.results-list')

  // add click handler for the aliss-search-button 
  search_button.addEventListener('click', (event) => {
    doPostCodeSearch();
  });

  // add click handler for the postcode box, includes the clear button 
  postcode_field.addEventListener('search', (event) => {
    doPostCodeSearch();
  });

  // add click handler for the search box, includes the clear button 
  query_field.addEventListener('search', (event) => {
    doPostCodeSearch();
  });

  // now create the radio button filters and their listeners
  buildCategoryRadioButtons(alissDefaults.categories);

  // we're ready, do the search
  doSearch();
}

// when ready build the widget
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM fully loaded and parsed');
  // get leaflet and run init
  loadLeafletJS(initALISSMap);

  
});


