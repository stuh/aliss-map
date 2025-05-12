let alissDefaults = {}
let currentPage = 1; // Add current page tracking

let postCodeToLatLngHistory = {}; // used as a cache to hold any previously fetched latlng from the api. 
let markersLayer = ''; // global markersLayer to hold the markers
let map = ''; // global map to hold the map
let postcode_field; // ref to the postcode field
let query_field; // ref to the query field
let output_msg; // ref to the output message div
let results_list; // ref to the results list div
let markersArray = []; // array to hold the markers
let validLatLngs = []; // Global array to store valid coordinates



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

    // get the data-markerid from the link and trigger the popup
    // disable for now as it's quite intrusive
    // const markerId = e.target.dataset.markerid;
    // const marker = markersArray[markerId];
    // if (marker) {
    //   marker.openPopup();
    // } else {
    //   console.log('Marker not found with ID:', markerId);
    // }

  }
});

// get the postcode
const getPostCode = () => {
  return (postcode_field.value && postcode_field.value !== 'Scotland, UK') ? postcode_field.value : alissDefaults.defaultPostCode;
}

// get the query
const getQuery = () => {
  return query_field.value || '' ;
}

// getServices function which grabs the services from ALISS and returns a services Array of Objects
const getServices = async (baseurl) => {
  // Set common parameters
  const postCode = getPostCode();
  const pclatlng = await getLatLngFromPostCode(postCode);
  const q = getQuery();
  let radius = postCode ? alissDefaults.defaultSearchRadius : null;
  
  // Get selected filter data
  const selectedFilter = document.querySelector('input[name="filter"]:checked')?.value || '';
  const filterData = JSON.parse(selectedFilter);
  
  // Create a Map to store unique services
  let servicesMap = new Map();

  // Function to fetch services for a specific filter
  const fetchServicesForFilter = async (paramName, paramValue) => {
    if (!paramValue) return;

    // set the baseUrl with only one filter type at a time
    const baseUrl = `${baseurl}?q=${q}&${paramName}=${paramValue}&postcode=${postCode}&page_size=1000&radius=${radius}&format=json&page=`;
    
    let page = 1;
    let lastResult = [];

    do {
      try {
        const resp = await fetch(`${baseUrl}${page}`);
        const data = await resp.json();
        lastResult = data;
        
        data.data.forEach(service => {
          const { id, name, gcfn, description, locations, url, phone, email, organisation, permalink } = service;
          const distance = getDistanceFromLatLonInKm(pclatlng[0], pclatlng[1], locations[0]?.latitude || 0, locations[0]?.longitude || 0);
          
          if (!servicesMap.has(id)) {
            servicesMap.set(id, { id, name, gcfn, description, locations, url, phone, email, organisation, distance, permalink });
          }
        });
        page++;
      } catch (err) {
        console.error(`Oops, something is wrong ${err}${page}`);
        break;
      }
    } while (lastResult.next !== null && lastResult.count > 0);
  };

  // Handle "All" selection
  if (filterData.categories || filterData.community_groups) {
    // If "All" is selected, fetch both categories and community groups
    const categoryArray = filterData.categories?.split(',') || [];
    for (const category of categoryArray) {
      await fetchServicesForFilter('categories', category);
    }
    
    // Split community groups into individual queries too
    if (filterData.community_groups) {
      const communityGroupArray = filterData.community_groups.split(';');
      for (const group of communityGroupArray) {
        await fetchServicesForFilter('community_groups', group);
      }
    }
  } else {
    // Handle individual filter selection
    if (filterData.type === 'category') {
      await fetchServicesForFilter('categories', filterData.value);
    } else if (filterData.type === 'community_group') {
      await fetchServicesForFilter('community_groups', filterData.value.replace(/,/g, ';'));
    }
  }

  // Convert the Map values to an array and return
  return Array.from(servicesMap.values());
}

//function to take the services array. We iterate each service to add a marker to the markersLayer LayerGroup
const addMarkersToMap = async (services) => {


// if we already have a layer group, clear it of Markers.
if (map.hasLayer(markersLayer)) {
  markersLayer.clearLayers();
}

// create an array to hold the latlngs of the markers
const postCode = getPostCode();
const pclatlng = await getLatLngFromPostCode(postCode)
validLatLngs = []; // Reset the global array to store valid coordinates

// for each service build the popup and then add to the layerGroup
services.forEach(service => {
  if (service.locations.length > 0) {

    service.locations.forEach(location => {
      // build the html servicecard but use the override feature for each location
      let serviceCard = buildServiceCard(service, location);
      
      let locationDistance = getDistanceFromLatLonInKm(pclatlng[0], pclatlng[1], location.latitude || 0, location.longitude || 0)
      // add the marker if it has a latlng
      if (location.latitude && location.longitude && (locationDistance < alissDefaults.defaultSearchRadius/1000)) {
        markersArray[`${service.id}${location.latitude}${location.longitude}`] = L.marker([location.latitude, location.longitude]).bindPopup(serviceCard).bindTooltip(`<strong>${service.name}</strong><br/>${location.street_address}<br/>${location.locality}`).addTo(markersLayer);
        // add latlng to the array to be used to set the bonds of the map
        validLatLngs.push([location.latitude, location.longitude]);
      }

    });
  }
  
})

// Update the total count display
if (getPostCode()) {
  document.getElementById('aliss-totals').textContent = `${services.length} services found at ${validLatLngs.length} locations within ${alissDefaults.defaultSearchRadius/1000}km of ${getPostCode()}`;
  
} else {
  document.getElementById('aliss-totals').textContent = `${services.length} services found`;
}

// set the bounds of the map and add make the map fit the bounds 
// If we have valid coordinates, fit the map to show all markers
  if (validLatLngs.length > 0) {
    const bounds = L.latLngBounds(validLatLngs);
    map.fitBounds(bounds, {
      padding: [20, 20]
    });


    // Set minimum zoom to current zoom level after fitting bounds
    setTimeout(() => {
      const currentZoom = map.getZoom();
      map.setMinZoom(currentZoom);
    }, 100);  
    // Enable zoom in only
    map.scrollWheelZoom.enable();
    map.touchZoom.enable();

    // Disable dragging
    // map.dragging.disable();
    
    // Set max bounds to prevent panning outside marker area
    map.setMaxBounds(bounds.pad(1));
  }
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
  serviceTitle.innerHTML = `<a href="${service.permalink}" target="_blank">${service.name}</a>`;
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
      locationText.innerHTML = `<a href="Javascript:;" tabindex="0" data-markerid="${service.id}${location.latitude}${location.longitude}">${location.formatted_address}</a> <svg class="pinsvg" width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>`;
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
  // Clear previous results
  results_list.innerHTML = '';
  
  // Remove previous pagination controls if they exist
  const paginationContainer = document.getElementById('aliss-pagination-controls');
  if (paginationContainer) {
    paginationContainer.remove();
  }

  // Check if pagination is enabled and there are enough items to paginate
  const paginationEnabled = alissDefaults.pagination;
  const itemsPerPage = alissDefaults.itemsPerPage;
  
  // Toggle the 'paginate' class based on whether pagination is enabled and needed
  if (paginationEnabled && itemsPerPage > 0 && services.length > itemsPerPage) {
    results_list.classList.add('paginate');
  } else {
    results_list.classList.remove('paginate');
  }
  
  let servicesToShow = services;

  if (paginationEnabled && itemsPerPage > 0 && services.length > itemsPerPage) {
    const totalPages = Math.ceil(services.length / itemsPerPage);
    // Ensure currentPage is within valid range
    currentPage = Math.max(1, Math.min(currentPage, totalPages));

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    servicesToShow = services.slice(startIndex, endIndex);

    // Build pagination controls
    buildPaginationControls(totalPages, services);
  } else {
    // If pagination is disabled or not needed, show all services
    servicesToShow = services;
  }

  // Append the service cards for the current page
  servicesToShow.forEach(service => {
    let serviceCard = buildServiceCard(service);
    results_list.appendChild(serviceCard);
  });
}

const buildPaginationControls = (totalPages, allServices) => {
  const container = document.createElement('div');
  container.id = 'aliss-pagination-controls';
  container.className = 'pagination-controls';

  // Previous Button
  const prevButton = document.createElement('button');
  prevButton.textContent = 'Previous';
  prevButton.className = 'pagination-button';
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      buildResultsList(allServices);
      scrollToResultsTop();
    }
  });
  container.appendChild(prevButton);

  // Page Number Indicator
  const pageInfo = document.createElement('span');
  pageInfo.textContent = ` Page ${currentPage} of ${totalPages} `;
  pageInfo.style.margin = '0 10px';
  container.appendChild(pageInfo);

  // Next Button
  const nextButton = document.createElement('button');
  nextButton.textContent = 'Next';
  nextButton.className = 'pagination-button';
  nextButton.disabled = currentPage === totalPages;
  nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      buildResultsList(allServices);
      scrollToResultsTop();
    }
  });
  container.appendChild(nextButton);

  // Append controls below the results list
  results_list.insertAdjacentElement('afterend', container);
}

// Helper function to scroll to the top of the results list
const scrollToResultsTop = () => {
  results_list.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const getLatLngFromPostCode = async (postcode) => {

  // if the postcode is empty then return the default
if (!postcode) {
  return [56.4907, -4.2026];
}

// if this postcode is in the cache then just return that instead of using the api
if (postCodeToLatLngHistory[postcode]) {
  return postCodeToLatLngHistory[postcode]
}

//if its a new one then lests return it from the api and cache the result
const postcodeApiUrl = 'https://api.postcodes.io/postcodes/'

try {
      // use fetch to make api call
      const resp = await fetch(`${postcodeApiUrl}${postcode}`);
      const data = await resp.json();
      const status = data.status;

      if (status == '200') {
        // if a match is found then first cache it
        postCodeToLatLngHistory[postcode] = [data.result.latitude, data.result.longitude];
        // then return it
        return [data.result.latitude, data.result.longitude];
      } else {
        return alissDefaults.defaultLatLng;
      }
      
    } catch (err) {
      return alissDefaults.defaultLatLng;
    }

}

// do the search
async function doSearch() {
  //ref to loader
  const loader = document.querySelector('.aliss-map-loader');

  // show the loader
  loader.classList.remove('load-hide');
  // Reset current page to 1 for new searches
  currentPage = 1;

  // get all the services from the API into an arrayOfObjects
  const servicesList = await getServices('https://api.aliss.org/v5/services/');

  // now sort them but distance into a new arrayOfObjects
  const sortedArray = servicesList.sort((a, b) => {  
  return a.distance >= b.distance
      ? 1
      : -1
  })
  
  // show results list first with pagination handling
  buildResultsList(sortedArray);

  // add markers to the map await so we can calculate the total that meet the distance critieria and use it in the results list
  await addMarkersToMap(sortedArray);

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
  // Load main Leaflet library
  var leafletScript = document.createElement('script');
  leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  leafletScript.crossOrigin = "";
  
  // Load marker cluster after main library
  leafletScript.onload = () => {
    var clusterScript = document.createElement('script');
    clusterScript.src = "https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js";
    clusterScript.crossOrigin = "";
    
    if (callback) {
      clusterScript.onload = callback;
    }
    
    document.head.appendChild(clusterScript);
  };

  document.head.appendChild(leafletScript);
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
          <form class="aliss-map-search-form" >
            <div class="aliss-map-search">
                <input type="search" name="aliss-postcode" id="aliss-postcode" placeholder="Enter your postcode">
                <input type="search" name="aliss-q" id="aliss-q" placeholder="Filter by keyword">
                <button type="submit" class="aliss-search-button">Search</button>
            </div>
          </form>

          <div class="output-message"></div>

          <div class="aliss-map-categories">
              
          </div>

          <div class="map-holder">
              <div id="map"></div>
          </div>
          <h3 id="aliss-totals" style="margin:20px 0;"></h3>
          <div class="results-list"></div>
      `;

      // Append the section to a container in the existing HTML
      document.querySelector(targetNode).appendChild(section);

}

// buulds and adds the configured categories to the filter buttons
const buildCategoryRadioButtons = (categories, communityGroups) => {
  // clear the aliss-map-categories div
  document.querySelector('.aliss-map-categories').innerHTML = '';
  const mapCategories = document.querySelector('.aliss-map-categories');

  // Create arrays to store the filter options
  const filterOptions = [];

  // Add categories with their type
  categories.forEach(category => {
    filterOptions.push({
      id: `cat-${category}`,
      value: category,
      type: 'category',
      label: category.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
    });
  });

  // Add community groups with their type
  if (Array.isArray(communityGroups)) {
    communityGroups.forEach(group => {
      filterOptions.push({
        id: `group-${group}`,
        value: group,
        type: 'community_group',
        label: group.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
      });
    });
  }

  // Create the "All" button first
  let allInput = document.createElement('input');
  allInput.type = 'radio';
  allInput.name = 'filter';
  allInput.id = 'all';
  allInput.value = JSON.stringify({
    categories: categories.join(','),
    community_groups: Array.isArray(communityGroups) ? communityGroups.join(';') : ''
  });
  allInput.checked = true;

  let allLabel = document.createElement('label');
  allLabel.htmlFor = 'all';
  allLabel.innerHTML = 'All';
  
  mapCategories.appendChild(allInput);
  mapCategories.appendChild(allLabel);

  // Add individual filter options
  filterOptions.forEach(option => {
    let input = document.createElement('input');
    input.type = 'radio';
    input.name = 'filter';
    input.id = option.id;
    input.value = JSON.stringify({
      type: option.type,
      value: option.value
    });

    let label = document.createElement('label');
    label.htmlFor = option.id;
    label.innerHTML = option.label;

    mapCategories.appendChild(input);
    mapCategories.appendChild(label);
  });

  // add listener to the radio buttons
  document.querySelectorAll('input[name="filter"]').forEach((elem) => {
    elem.addEventListener("change", function(event) {
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

      .aliss-map  .aliss-map-search{
        padding:10px 0 20px;   
        display:flex;
        align-items:center;
        flex-wrap: wrap;
        flex-direction:row;
      }
      
      .aliss-map  #aliss-postcode, .aliss-map #aliss-q{
        width:auto;
        display:inline-block;
        margin-bottom:0px;
        border:1px solid #212121;
        padding:16px 18px;
        margin-right:5px;
      }
        @media (max-width: 45em) {
        .aliss-map  .aliss-map-search{
          flex-direction:column;
        }
          .aliss-map  #aliss-postcode, .aliss-map #aliss-q{
            width:100%;
            margin-bottom:10px;
          }
      }
      .aliss-map  .aliss-search-button{
        padding: 0.6em 0.5em;
        font-size: 20px;
        min-width: 150px;
        position: relative;

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
      .aliss-map .leaflet-popup-content-wrapper .service-description{
        overflow-y: scroll;
        height:60px;
      }
      
      .aliss-map .service-links a{
        display:block;
        padding:5px 0px 5px 0;
        margin-right:10px;
      }
      .aliss-map .location-map-link .pinsvg{
        display:none;
      }
      .aliss-map .results-list {
        max-height: 75vh;
        overflow-y: auto;
      }
      .aliss-map .results-list.paginate {
        max-height: none;
        overflow-y: visible;
      }
      .aliss-map .results-list .service-links{
        display:flex;
      }
      .aliss-map .results-list .service-card{
        position:relative;
        margin-bottom:40px;
        margin-top:40px;
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

      /* Pagination Controls Styling */
      .aliss-map .pagination-controls {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 1rem;
        margin-bottom: 1rem;
        gap: 0.5rem;
      }
      
      .aliss-map .pagination-controls button {
        padding: 0.6em 0.5em;
        font-size: 20px;
        min-width: 150px;
        position: relative;

      }

      `
document.head.appendChild(style);


// lets begin
// add the leaflet css
addCSSFile('https://unpkg.com/leaflet@1.9.2/dist/leaflet.css');
addCSSFile('https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css');
addCSSFile('https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css');

// load the leaflet js and callback the createBaseMap function to build the default map

// init the widget
const initALISSMap = () => {
  // set the defaults by merging provided config with internal defaults if needed
  alissDefaults = {
    defaultLatLng: [56.4907, -4.2026], // Sensible default center
    defaultSearchRadius: 10000, // Default radius
    pagination: false, // Default pagination off
    itemsPerPage: 20, // Default items per page
    ...alissMapConfig // Override with user-provided config
  }

  // build basic layout
  buildLayout(alissDefaults.target);

  // create and turn on the loader
  createLoaderSVG();

  // create the base map
  map = L.map('map').setView(alissDefaults.defaultLatLng, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: `&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy <a href="https://www.ons.gov.uk/methodology/geography/licences">Crown copyright and database right ${new Date().getFullYear()}</a> `
  }).addTo(map);
  // create a map layer to hold the markers
  markersLayer = L.markerClusterGroup();
  // markersLayer = L.layerGroup();
  // add it to the map
  map.addLayer(markersLayer);

  // reference the aliss-map-search-form
  search_form = document.querySelector('.aliss-map-search-form');
  // reference the postcode_field
  postcode_field = document.querySelector('#aliss-postcode');
  // reference the query field
  query_field = document.querySelector('#aliss-q');
  // reference the output div
  output_msg = document.querySelector('.output-message')
  // reference the results list
  results_list = document.querySelector('.results-list')

  // add submit handler for the aliss-map-search-form
  search_form.addEventListener('submit', (event) => {
    event.preventDefault();
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
  buildCategoryRadioButtons(
    alissDefaults.categories,
    alissDefaults.communityGroups
  );

  // we're ready, do the search
  doSearch();
}

// when ready build the widget  
document.addEventListener('DOMContentLoaded', function() {
  // Check if target exists before loading leaflet and initializing
  if (alissMapConfig.target && document.querySelector(alissMapConfig.target)) {
    loadLeafletJS(initALISSMap);
  } else {
    console.warn('ALISS Map target element not found');
    loadLeafletJS();
  }
});


