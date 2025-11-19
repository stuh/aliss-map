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

// Global variables for GeoJSON service areas functionality
let serviceAreaBoundaries = new Map(); // Cache for GeoJSON boundaries
let allServiceAreas = null; // Cache for all service areas data
let serviceAreaPolygons = []; // Store polygon overlays for removal/update

// Make serviceAreaPolygons globally accessible for debugging
window.serviceAreaPolygons = serviceAreaPolygons;

// Clear service area boundaries and polygons for fresh reload
const clearServiceAreaData = () => {
  console.log('🔄 Clearing service area boundaries and polygons for fresh reload');
  
  // Clear existing polygons from map
  serviceAreaPolygons.forEach(polygon => {
    if (map && map.hasLayer(polygon)) {
      map.removeLayer(polygon);
    }
  });
  serviceAreaPolygons.length = 0; // Clear the array
  
  // Clear cached boundaries and service areas
  serviceAreaBoundaries.clear();
  allServiceAreas = null;
  
  // Update global reference
  window.serviceAreaPolygons = serviceAreaPolygons;
  
  console.log('✅ Service area data cleared - ready for fresh configuration');
};

// Make clearServiceAreaData globally accessible for the configuration interface
window.clearServiceAreaData = clearServiceAreaData;

// Add polygon overlays to show service area boundaries on the map
const addServiceAreaPolygons = () => {
  if (!map || serviceAreaBoundaries.size === 0) {
    console.log('🔍 No map or service area boundaries to display');
    return;
  }
  
  console.log('🗺️ Adding service area polygon overlays to map...');
  console.log('Available boundaries:', Array.from(serviceAreaBoundaries.keys()));
  
  // Remove existing polygons first
  serviceAreaPolygons.forEach(polygon => {
    if (map.hasLayer(polygon)) {
      map.removeLayer(polygon);
    }
  });
  serviceAreaPolygons.length = 0; // Clear the array
  
  // Style for service area polygons - more visible for testing
  const polygonStyle = {
    color: '#004785',        // ALISS dark blue border
    weight: 3,               // Border thickness
    fillColor: '#1e7abd',    // ALISS blue fill
    fillOpacity: 0.15,       // Slightly more visible fill
    opacity: 0.9,            // More opaque border
    dashArray: '8, 8'        // Dashed border for better visibility
  };
  
  // Add each service area boundary as a polygon overlay
  serviceAreaBoundaries.forEach((geoJsonFeature, areaSlug) => {
    try {
      console.log(`Processing boundary for ${areaSlug}:`, geoJsonFeature);
      
      // Handle different GeoJSON structures
      let geometry = geoJsonFeature;
      if (geoJsonFeature.geometry) {
        geometry = geoJsonFeature.geometry;
      }
      
      console.log(`Geometry type for ${areaSlug}:`, geometry?.type);
      
      if (geometry && geometry.type === 'Polygon' && geometry.coordinates) {
        // Create Leaflet polygon from coordinates
        // GeoJSON uses [longitude, latitude], Leaflet uses [latitude, longitude]
        const leafletCoords = geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        console.log(`Converting ${leafletCoords.length} coordinates for ${areaSlug} (Polygon)`);
        
        const polygon = L.polygon(leafletCoords, {
          ...polygonStyle,
          // Add title attribute for accessibility
          title: `Service Area: ${areaSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`
        });
        
        // Add to map
        polygon.addTo(map);
        serviceAreaPolygons.push(polygon);
        
        console.log(`✅ Added polygon overlay for ${areaSlug} with ${leafletCoords.length} points`);
      } else if (geometry && geometry.type === 'MultiPolygon' && geometry.coordinates) {
        // Handle MultiPolygon - create a polygon for each sub-polygon
        console.log(`Processing MultiPolygon for ${areaSlug} with ${geometry.coordinates.length} polygons`);
        
        geometry.coordinates.forEach((polygonCoords, index) => {
          try {
            // Each polygon in MultiPolygon has its own coordinate array
            // Take the exterior ring (first array) of each polygon
            const leafletCoords = polygonCoords[0].map(coord => [coord[1], coord[0]]);
            console.log(`Converting ${leafletCoords.length} coordinates for ${areaSlug} polygon ${index + 1}`);
            
            const polygon = L.polygon(leafletCoords, {
              ...polygonStyle,
              // Add title attribute for accessibility
              title: `Service Area: ${areaSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (Part ${index + 1})`
            });
            
            // Add to map
            polygon.addTo(map);
            serviceAreaPolygons.push(polygon);
            
            console.log(`✅ Added MultiPolygon part ${index + 1} for ${areaSlug} with ${leafletCoords.length} points`);
          } catch (partError) {
            console.error(`❌ Error creating MultiPolygon part ${index + 1} for ${areaSlug}:`, partError);
          }
        });
      } else {
        console.warn(`❌ Cannot create polygon for ${areaSlug}: invalid or unsupported geometry type (${geometry?.type})`);
        console.warn('Supported types: Polygon, MultiPolygon');
        console.warn('Full geometry object:', geometry);
      }
    } catch (error) {
      console.error(`❌ Error creating polygon overlay for ${areaSlug}:`, error);
    }
  });
  
  // Update global reference
  window.serviceAreaPolygons = serviceAreaPolygons;
  
  console.log(`📍 Added ${serviceAreaPolygons.length} service area polygon overlays to map`);
  
  // Fit map to show all polygons if any were added
  if (serviceAreaPolygons.length > 0) {
    try {
      const group = new L.featureGroup(serviceAreaPolygons);
      map.fitBounds(group.getBounds(), { padding: [20, 20] });
      console.log('🎯 Map view adjusted to show service area boundaries');
    } catch (error) {
      console.warn('Could not fit map to polygon bounds:', error);
    }
  }
};

// Point-in-polygon algorithm using ray casting method
const isPointInPolygon = (point, polygon) => {
  const [x, y] = point;
  let inside = false;
  
  // Handle different GeoJSON polygon structures
  let coords = polygon;
  if (polygon.type === 'Polygon') {
    coords = polygon.coordinates[0]; // Take exterior ring
  } else if (Array.isArray(polygon) && Array.isArray(polygon[0])) {
    coords = polygon;
  }
  
  if (!coords || coords.length < 3) {
    return false;
  }
  
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
};

// Check if a point is within any of the configured service area boundaries
const isPointInServiceAreas = (lat, lng) => {
  if (!alissDefaults.serviceAreas || serviceAreaBoundaries.size === 0) {
    console.log('🔍 No service area boundaries loaded, allowing all points (fallback to no geographic filtering)');
    return true; // If no service areas configured or no boundaries available, don't filter
  }
  
  const point = [lng, lat]; // GeoJSON uses [longitude, latitude]
  console.log(`🔍 Checking if point [${lat}, ${lng}] is in ${serviceAreaBoundaries.size} service area boundaries...`);
  
  // Check against each service area boundary
  for (const [areaName, geoJsonData] of serviceAreaBoundaries) {
    if (geoJsonData) {
      // Handle GeoJSON Feature object (parsed from geojson string)
      let geometry = geoJsonData;
      if (geoJsonData.type === 'Feature' && geoJsonData.geometry) {
        geometry = geoJsonData.geometry;
      }
      
      // Now check the geometry
      if (geometry && geometry.type === 'Polygon') {
        if (isPointInPolygon(point, geometry.coordinates[0])) {
          console.log(`✅ Point [${lat}, ${lng}] is INSIDE ${areaName} boundary`);
          return true;
        }
      } else if (geometry && geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
          if (isPointInPolygon(point, polygon[0])) {
            console.log(`✅ Point [${lat}, ${lng}] is INSIDE ${areaName} boundary (MultiPolygon)`);
            return true;
          }
        }
      }
      // Handle direct geometry object (fallback)
      else if (geoJsonData.type === 'Polygon') {
        if (isPointInPolygon(point, geoJsonData.coordinates[0])) {
          console.log(`✅ Point [${lat}, ${lng}] is INSIDE ${areaName} boundary`);
          return true;
        }
      } else if (geoJsonData.type === 'MultiPolygon') {
        for (const polygon of geoJsonData.coordinates) {
          if (isPointInPolygon(point, polygon[0])) {
            console.log(`✅ Point [${lat}, ${lng}] is INSIDE ${areaName} boundary (MultiPolygon)`);
            return true;
          }
        }
      }
    }
  }
  
  console.log(`❌ Point [${lat}, ${lng}] is OUTSIDE all configured service area boundaries`);
  return false;
};

// Fetch GeoJSON boundaries from service areas API
const fetchServiceAreaBoundaries = async (forceReload = false) => {
  if (!alissDefaults.serviceAreas) {
    console.log('Skipping boundary fetch - no service areas configured');
    return; // No service areas configured
  }
  
  // If forcing reload or no boundaries loaded yet
  if (forceReload || serviceAreaBoundaries.size === 0) {
    console.log('🔄 Loading service area boundaries...');
  } else {
    console.log('Skipping boundary fetch - already loaded (use forceReload to refresh)');
    return;
  }
  
  const configuredAreas = Array.isArray(alissDefaults.serviceAreas) 
    ? alissDefaults.serviceAreas 
    : alissDefaults.serviceAreas.split(',');
    
  console.log('🗺️ Fetching GeoJSON boundaries for service areas:', configuredAreas);
  
  try {
    // First, fetch all service areas if we haven't already
    if (!allServiceAreas) {
      console.log('🌍 Fetching all service areas from API...');
      const response = await fetch('https://api.aliss.org/v5/service-areas?source=customisable-map');
      if (response.ok) {
        const data = await response.json();
        console.log('Raw service areas API response:', data);
        
        // Handle different possible response formats
        if (data.data && Array.isArray(data.data)) {
          allServiceAreas = data.data;
        } else if (data.results && Array.isArray(data.results)) {
          allServiceAreas = data.results;
        } else if (Array.isArray(data)) {
          allServiceAreas = data;
        } else {
          console.error('❌ Unexpected service areas API response format:', data);
          return;
        }
        
        console.log(`✅ Loaded ${allServiceAreas.length} total service areas from API`);
      } else {
        console.warn(`❌ Failed to fetch service areas list: ${response.status}`);
        return;
      }
    }
    
    // Now filter and store the boundaries for our configured areas
    if (Array.isArray(allServiceAreas)) {
      configuredAreas.forEach(areaSlug => {
        const serviceArea = allServiceAreas.find(area => area.slug === areaSlug);
        if (serviceArea) {
          if (serviceArea.geojson) {
            // Parse the geojson string if it exists
            try {
              const geometry = JSON.parse(serviceArea.geojson);
              serviceAreaBoundaries.set(areaSlug, geometry);
              console.log(`✅ Loaded GeoJSON boundary for ${areaSlug}:`, geometry);
            } catch (error) {
              console.warn(`❌ Failed to parse GeoJSON for ${areaSlug}:`, error);
            }
          } else if (serviceArea.geometry) {
            serviceAreaBoundaries.set(areaSlug, serviceArea.geometry);
            console.log(`✅ Loaded geometry boundary for ${areaSlug}:`, serviceArea.geometry);
          } else {
            console.warn(`❌ No boundary data found for service area: ${areaSlug} (service area exists but has no geometry/geojson)`);
          }
        } else {
          console.warn(`❌ Service area not found: ${areaSlug}`);
        }
      });
    } else {
      console.error('❌ allServiceAreas is not an array:', allServiceAreas);
      return;
    }
    
    console.log(`✅ Service area boundaries loaded: ${serviceAreaBoundaries.size}/${configuredAreas.length}`);
  } catch (error) {
    console.error('Error fetching service area boundaries:', error);
  }
};

// Note: Removed geocoding functionality to avoid external API dependencies
// Services without coordinates are included in results but not shown on map
// This matches the behavior of postcode-based searches

const doPostCodeSearch = () => {
  // clear any previous errors and error styles
  output_msg.textContent = '';
  postcode_field.classList.remove('search-error');

  // If serviceAreas are configured, skip postcode validation
  const hasServiceAreas = alissDefaults.serviceAreas && 
                          (Array.isArray(alissDefaults.serviceAreas) ? alissDefaults.serviceAreas.length > 0 : alissDefaults.serviceAreas !== '');
  
  if (hasServiceAreas) {
    // Service areas are configured, postcode is not required
    doSearch();
    return;
  }

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
  // Only handle clicks on location links inside the results list
  if (
    e.target &&
    e.target.tagName === 'A' &&
    e.target.dataset.markerid &&
    e.target.closest('.results-list')
  ) {
    const markerId = e.target.dataset.markerid;
    const marker = markersArray[markerId];
    if (marker) {
      // Zoom and center the map on the marker
      map.setView(marker.getLatLng(), 17, { animate: true });
      marker.openPopup();

      // Optionally scroll to the map
      const offsetTop = document.querySelector('.map-holder').offsetTop - 30;
      scroll({
        top: offsetTop,
        behavior: "smooth"
      });
    } else {
      console.log('Marker not found with ID:', markerId);
    }
    e.preventDefault();
  }
});

// get the chosen category, default to all
const getSelectedCategory = () => {
  // get the selected category or get all if none selected
  const category = document.querySelector('input[name="category"]:checked')?.value || '';
  return category;
}

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
  // set some variables
  // set the parameters
  const postCode = getPostCode();
  const pclatlng = await getLatLngFromPostCode(postCode)
  const q = getQuery();
  const category = getSelectedCategory();
  // if there is no postcode then don't limit by radius as the aliss search uses a default centerpoint, we want everything.
  let radius = null;
  if (postCode) {
    radius = alissDefaults.defaultSearchRadius;
  }
  
  // get the communityGroups from the config, if any exist then we need to replace the commas with semi colons
  const communityGroups = Array.isArray(alissDefaults.communityGroups)
  ? alissDefaults.communityGroups.join(';')
  : (alissDefaults.communityGroups || '').split(',').join(';');

  // get the serviceAreas from the config, if any exist then we need to replace the commas with semi colons
  const serviceAreas = Array.isArray(alissDefaults.serviceAreas)
  ? alissDefaults.serviceAreas.join(';')
  : (alissDefaults.serviceAreas || '').split(',').join(';');

  // get the location_type from the config
  const locationType = alissDefaults.locationType || '';

  // category might have multiple comma seperated valueds so we need to split them into an array, eg. food-and-nutrition, money
  const categoryArray = getSelectedCategory().split(',');
  // we can then loop through the categories and add all the services for each one to a services Map, we're using a map with id as the key so we can avoid duplication of services in the list
  let servicesMap = new Map(); // Use a Map to store unique services
  
  // Helper function to fetch all pages for a single category
  const fetchCategoryData = async (cat) => {
    let allServicesForCategory = [];
    
    // Only use distance sorting for postcode searches, not region searches
    const hasServiceAreas = alissDefaults.serviceAreas &&
                            (Array.isArray(alissDefaults.serviceAreas) ? alissDefaults.serviceAreas.length > 0 : alissDefaults.serviceAreas !== '');
    const sortParam = (hasServiceAreas || radius === null) ? '' : '&sort=sort-distance';
    
    const baseUrl = `${baseurl}?q=${q}&categories=${cat}&postcode=${postCode}&community_groups=${communityGroups}&service_areas=${serviceAreas}&location_type=${locationType}&page_size=1000&radius=${radius}${sortParam}&format=json&source=customisable-map&page=`;
    let page = 1;
    let lastResult = [];
    
    do {
      try {
        const resp = await fetch(`${baseUrl}${page}`);
        const data = await resp.json();
        lastResult = data;
        allServicesForCategory = allServicesForCategory.concat(data.data);
        page++;
      } catch (err) {
        console.error(`Error fetching category ${cat}, page ${page}: ${err}`);
        break;
      }
    } while (lastResult.next !== null && lastResult.count > 0);
    
    return allServicesForCategory;
  };

  // Fetch data for all categories in parallel
  try {
    const categoryPromises = categoryArray.map(cat => fetchCategoryData(cat));
    const allCategoryResults = await Promise.all(categoryPromises);
    
    // Process all results and add to the servicesMap
    allCategoryResults.flat().forEach(service => {
      const { name, gcfn, description, locations, url, phone, email, organisation, permalink, id, referral_url } = service;
      // Calculate distance
      const distance = getDistanceFromLatLonInKm(pclatlng[0], pclatlng[1], locations[0]?.latitude || 0, locations[0]?.longitude || 0);
      
      // Only add if not already in the map
      if (!servicesMap.has(id)) {
        servicesMap.set(id, { id, name, gcfn, description, locations, url, phone, email, organisation, distance, permalink, referral_url });
      } else {
        console.log(`Duplicate service skipped: ${name} (ID: ${id})`);
      }
    });
  } catch (err) {
    console.error('Error fetching services:', err);
  }

  // Convert the Map values to an array
  const services = Array.from(servicesMap.values());
  // let's return the services array of objects
  return services;

}


//function to take the services array. We iterate each service to add a marker to the markersLayer LayerGroup
const addMarkersToMap = async (services) => {
  // Performance measurement
  const startTime = performance.now();

  // if we already have a layer group, clear it of Markers.
  if (map.hasLayer(markersLayer)) {
    markersLayer.clearLayers();
  }

  // Ensure service area boundaries are loaded if using service areas
  await fetchServiceAreaBoundaries();

  // Add service area polygons to the map
  addServiceAreaPolygons();

  // create an array to hold the latlngs of the markers
  const postCode = getPostCode();
  const pclatlng = await getLatLngFromPostCode(postCode)
  validLatLngs = []; // Reset the global array to store valid coordinates
  
  // Create markers in batches to avoid UI freeze
  const batchSize = 200; // Process 200 markers at a time
  const markers = [];
  const maxRadius = alissDefaults.defaultSearchRadius/1000;
  
  // Check if we're using service area boundaries or traditional radius filtering
  const hasServiceAreas = alissDefaults.serviceAreas && 
                          (Array.isArray(alissDefaults.serviceAreas) ? alissDefaults.serviceAreas.length > 0 : alissDefaults.serviceAreas !== '');
  
  // First pass: collect all valid markers without rendering
  for (const service of services) {
    if (service.locations.length > 0) {
      for (const location of service.locations) {
        const lat = location.latitude;
        const lng = location.longitude;
        
        // Only process locations that have coordinates
        // Locations without coordinates are included in results list but not shown on map
        if (lat && lng) {
          let includeLocation = false;
          
          if (hasServiceAreas) {
            // Use GeoJSON boundary filtering for service areas
            includeLocation = isPointInServiceAreas(lat, lng);
            if (!includeLocation) {
              console.log(`Location filtered out by service area boundaries: ${service.name} at ${location.formatted_address || 'Unknown address'}`);
            }
          } else {
            // Use traditional radius filtering for postcode-based searches
            const locationDistance = getDistanceFromLatLonInKm(pclatlng[0], pclatlng[1], lat, lng);
            includeLocation = locationDistance < maxRadius;
            if (!includeLocation) {
              console.log(`Location skipped due to distance: ${service.name} at ${location.formatted_address} (${locationDistance.toFixed(2)} km away) max radius is ${maxRadius} km`);
            }
          }
          
          if (includeLocation) {
            // Store data for deferred marker creation
            markers.push({
              service,
              location,
              latlng: [lat, lng]
            });
            
            // Add to valid coordinates for bounds calculation
            validLatLngs.push([lat, lng]);
          }
        } else {
          // Log that this location doesn't have coordinates but will still appear in results
          console.log(`Location without coordinates (will show in results only): ${service.name} at ${location.formatted_address || 'No address'}`);
        }
      }
    }
  }
  
  // Second pass: Create and add markers in batches
  const totalMarkers = markers.length;
  const batches = Math.ceil(totalMarkers / batchSize);
  
  // Create and add markers in batches
  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min((i + 1) * batchSize, totalMarkers);
    const batch = markers.slice(start, end);
    
    batch.forEach(({ service, location, latlng }) => {
      // Build popup content only when needed (lazy loading)
      const markerObj = L.marker(latlng);
      
      // Use lazy binding of popup and tooltip to improve performance
      const popupFn = () => {
        const serviceCard = buildServiceCard(service, location);
        return serviceCard;
      };
      
      // Configure popup options to prevent clipping and auto-pan intelligently
      const popupOptions = {
        maxWidth: 300,
        minWidth: 250,
        maxHeight: 400,
        autoPan: true,
        autoPanPadding: [10, 10],
        autoPanPaddingBottomRight: [10, 80], // Extra padding for bottom right
        autoPanPaddingTopLeft: [10, 10],
        keepInView: true, // Keep popup in view when map is panned
        closeButton: true,
        autoClose: false, // Don't auto-close when another popup opens
        className: 'service-popup'
      };
      
      markerObj.bindPopup(popupFn, popupOptions)
               .bindTooltip(`<strong>${service.name}</strong><br/>${location.street_address || ''}<br/>${location.locality || ''}`);
               
      markersArray[`${service.id}${location.latitude}${location.longitude}`] = markerObj;
      markerObj.addTo(markersLayer);
    });
    
    // Allow a small break for UI to respond between batches
    if (i < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  // Performance logging
  const endTime = performance.now();
  console.log(`Added ${totalMarkers} markers in ${(endTime - startTime).toFixed(2)}ms`);

// Update the total count display
  document.getElementById('aliss-totals').textContent = `${services.length} services nearest to you or available in your region.`;

  // Scotland bounds with generous margin for popup display
  const scotlandBounds = L.latLngBounds(
    [53.8, -9.2],  // Southwest corner (generous margin for popups)
    [61.6, 1.2]    // Northeast corner (generous margin for popups)
  );

  // Set minimum zoom and bounds restrictions BEFORE fitBounds to prevent conflict
  map.setMinZoom(6);
  map.setMaxBounds(scotlandBounds);

  // Now fit the map to show all pins, respecting the bounds constraints
  if (validLatLngs.length > 0) {
    const bounds = L.latLngBounds(validLatLngs);
    // Use maxZoom option to prevent zooming in too far on small datasets
    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 15 // Don't zoom in beyond this level
    });
  } else {
    // If no valid markers, show Scotland view
    map.setView([56.4907, -4.2026], 6);
  }

  // Enable zoom and dragging
  map.scrollWheelZoom.enable();
  map.touchZoom.enable();
  map.dragging.enable();
}

// this builds the html for a service to be used in both the map popup and list, keeps it the same.
// the only difference is that some services have multiple locations, when this is the case we dont want to list them all on the
// map popup as its confusing, so we have a locationOverride parameter that lets us replace the array of objects with a single object instead.
// you can see this called in the addMarkersToMap() function
const buildServiceCard = (service, locationOverride) => {
  // Use document fragment for better performance when creating multiple DOM nodes
  const fragment = document.createDocumentFragment();
  let serviceCard = document.createElement('div');
  serviceCard.className = "service-card";
  fragment.appendChild(serviceCard);

  // Use a single innerHTML operation for the title instead of multiple steps
  serviceCard.innerHTML = `
    <h3 class="service-title">
      <a href="${service.permalink}" target="_blank">${service.name}</a>
    </h3>
    <div class="service-org">
      ${service.organisation.aliss_url 
        ? `By <a href="${service.organisation.aliss_url}" target="_blank">${service.organisation.name}</a>` 
        : `By ${service.organisation.name}`}
    </div>
  `;
  
  // Get reference to service card after HTML was set
  serviceCard = fragment.querySelector('.service-card');

  let serviceDescription = document.createElement('div');
  serviceDescription.className = "service-description";
  serviceDescription.innerHTML = service.description;
  serviceCard.appendChild(serviceDescription);

  let serviceLocations = document.createElement('div');
  serviceLocations.className = "service-locations";

  // here we can swap out the services.locations for a single injected location for popups
  let locations = locationOverride ? [locationOverride] : service.locations;
  
  // Filter locations by radius when using postcode search or by GeoJSON boundaries for service areas
  const postCode = getPostCode();
  const maxRadius = alissDefaults.defaultSearchRadius/1000;
  
  // Check if we're using service area boundaries or traditional radius filtering
  const hasServiceAreas = alissDefaults.serviceAreas && 
                          (Array.isArray(alissDefaults.serviceAreas) ? alissDefaults.serviceAreas.length > 0 : alissDefaults.serviceAreas !== '');
  
  if (hasServiceAreas) {
    // Filter locations using GeoJSON boundaries
    const filteredLocations = [];
    
    for (const location of locations) {
      const lat = location.latitude;
      const lng = location.longitude;
      
      if (lat && lng) {
        // Only filter locations with coordinates using boundaries
        if (isPointInServiceAreas(lat, lng)) {
          filteredLocations.push(location);
        }
      } else {
        // Include locations without coordinates (they can't be boundary-filtered)
        // This matches the behavior of postcode searches where services without 
        // coordinates appear in results but not on map
        filteredLocations.push(location);
      }
    }
    
    locations = filteredLocations;
  } else if (window.currentSearchCenter && postCode) {
    // Use traditional radius filtering for postcode-based searches
    const filteredLocations = [];
    
    locations.forEach(location => {
      if (location.latitude && location.longitude) {
        const locationDistance = getDistanceFromLatLonInKm(
          window.currentSearchCenter[0], 
          window.currentSearchCenter[1], 
          location.latitude, 
          location.longitude
        );
        
        if (locationDistance < maxRadius) {
          filteredLocations.push(location);
        }
      } else {
        // Include locations without coordinates (they can't be distance-filtered)
        filteredLocations.push(location);
      }
    });
    
    locations = filteredLocations;
  }
  
  // Optimize location rendering by creating HTML string once
  let locationsHTML = '';
  locations.forEach(location => {
    const locationClass = location.latitude && location.longitude ? "location-map-link" : "location-text";
    const dataAttrs = location.latitude && location.longitude ? 
      `data-markerid="${service.id}${location.latitude}${location.longitude}"` : '';
      
    locationsHTML += `<span class="${locationClass}" ${dataAttrs}>
      <a href="Javascript:;" tabindex="0" data-markerid="${service.id}${location.latitude}${location.longitude}">
        ${location.formatted_address}
      </a> 
    </span>`;
  });
  serviceLocations.innerHTML = locationsHTML;
  serviceCard.appendChild(serviceLocations);

  // Service links
  let linksHTML = '<div class="service-links">';
  if (service.url) {
    linksHTML += `<a class="service-url" href="${service.url}" target="_blank">Visit the website</a>`;
  }
  if (service.phone) {
    linksHTML += `<a class="service-phone" href="tel:${service.phone}" target="_blank">${service.phone}</a>`;
  }
  if (service.email) {
    linksHTML += `<a class="service-email" href="mailto:${service.email}" target="_blank">${service.email}</a>`;
  }
  if (service.referral_url) {
    linksHTML += `<a class="service-referral" href="${service.referral_url}" target="_blank">Referral information</a>`;
  }
  linksHTML += '</div>';
  
  const linksContainer = document.createElement('div');
  linksContainer.innerHTML = linksHTML;
  serviceCard.appendChild(linksContainer.firstChild);
  
  return serviceCard;
}

const buildResultsList = (services) => {
  // Performance measurement
  const startTime = performance.now();

  // Clear previous results
  results_list.innerHTML = '';
  
  // Remove previous pagination controls if they exist
  const paginationContainer = document.getElementById('aliss-pagination-controls');
  if (paginationContainer) {
    paginationContainer.remove();
  }

  // Automatic pagination: only activate when more than 6 results
  const itemsPerPage = 6;
  const paginationEnabled = services.length > 6;
  
  // Toggle the 'paginate' class based on whether pagination is needed
  if (paginationEnabled) {
    results_list.classList.add('paginate');
  } else {
    results_list.classList.remove('paginate');
  }
  
  let servicesToShow = services;

  if (paginationEnabled) {
    const totalPages = Math.ceil(services.length / itemsPerPage);
    // Ensure currentPage is within valid range
    currentPage = Math.max(1, Math.min(currentPage, totalPages));

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    servicesToShow = services.slice(startIndex, endIndex);

    // Build pagination controls
    buildPaginationControls(totalPages, services);
  } else {
    // If pagination is not needed, show all services
    servicesToShow = services;
  }

  // Use a document fragment to batch DOM operations
  const fragment = document.createDocumentFragment();
  
  // Append the service cards for the current page
  servicesToShow.forEach(service => {
    const serviceCard = buildServiceCard(service);
    fragment.appendChild(serviceCard);
  });
  
  // Add all cards to the DOM in one operation
  results_list.appendChild(fragment);
  
  // Performance logging
  const endTime = performance.now();
  console.log(`Rendered ${servicesToShow.length} service cards in ${(endTime - startTime).toFixed(2)}ms`);
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
  // get the postcode for when setting the distance and store search center coordinates globally
  const postCode = getPostCode();
  window.currentSearchCenter = await getLatLngFromPostCode(postCode);

  //ref to loader
  const loader = document.querySelector('.aliss-map-loader');

  // show the loader
  loader.classList.remove('load-hide');
  // Reset current page to 1 for new searches
  currentPage = 1;

  // Load service area boundaries if using service areas
  await fetchServiceAreaBoundaries();

  // Add service area polygons to the map
  addServiceAreaPolygons();

  // get all the services from the API into an arrayOfObjects
  const servicesList = await getServices('https://api.aliss.org/v5/services/');

  // show results list first with pagination handling (using API order, no distance sorting)
  buildResultsList(servicesList);

  // add markers to the map await so we can calculate the total that meet the distance critieria and use it in the results list
  await addMarkersToMap(servicesList);

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

          <div class="aliss-map-location-type" style="display: none;">
              <fieldset id="aliss-filter-by-location-type">
                <legend class="sr-only">Filter by coverage</legend>
                <div class="location-type-item">
                  <input type="radio" name="aliss-location-type" id="aliss-location-local" value="local">
                  <label for="aliss-location-local">Only show services based locally</label>
                </div>
                <div class="location-type-item">
                  <input type="radio" name="aliss-location-type" id="aliss-location-national" value="national">
                  <label for="aliss-location-national">Only show national services active in the area</label>
                </div>
                <div class="location-type-item">
                  <input type="radio" name="aliss-location-type" id="aliss-location-all" value="" checked>
                  <label for="aliss-location-all">Show all services</label>
                </div>
              </fieldset>
          </div>

          <div class="aliss-map-categories">
              
          </div>

          <div class="map-holder">
              <div id="map"></div>
          </div>
          <h3 id="aliss-totals"></h3>
          <p>Only services with an address will show on the map. All services are listed in the results.</p>
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
  
  // create the all button first
  let allWrapper = document.createElement('span'); // Wrapper for 'All'
  allWrapper.className = 'category-item';
  let allInput = document.createElement('input');
  allInput.type = 'radio';
  allInput.name = 'category';
  allInput.id = 'all';
  allInput.value = categories.join(',');
  allInput.checked = true;
  let allLabel = document.createElement('label');
  allLabel.htmlFor = 'all';
  allLabel.innerHTML = 'All';
  allWrapper.appendChild(allInput);
  allWrapper.appendChild(allLabel);
  mapCategories.appendChild(allWrapper); // Append the wrapper

  // Add individual categories
  categories.forEach(category => {
    let wrapper = document.createElement('span'); // Create a wrapper span
    wrapper.className = 'category-item'; // Add a class for styling

    let input = document.createElement('input');
    input.type = 'radio';
    input.name = 'category';
    input.id = category;
    input.value = category;
    
    let label = document.createElement('label');
    label.htmlFor = category;
    label.innerHTML = category.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    
    wrapper.appendChild(input); // Append input to wrapper
    wrapper.appendChild(label); // Append label to wrapper
    mapCategories.appendChild(wrapper); // Append wrapper to the main container
  });

  // add listener to the radio buttons
  document.querySelectorAll('input[name="category"]').forEach((elem) => {
    elem.addEventListener("change", function(event) {
      doSearch();
    });
  });

}

// Function to show/hide and setup location type filters
const setupLocationTypeFilter = () => {
  const locationTypeDiv = document.querySelector('.aliss-map-location-type');
  
  // Only show location type filter if no locationType was configured (i.e., "Show all services" was selected)
  if (!alissDefaults.locationType || alissDefaults.locationType === '') {
    locationTypeDiv.style.display = 'block';
    
    // Add event listeners to the radio buttons
    document.querySelectorAll('input[name="aliss-location-type"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        // Update the alissDefaults with the selected value
        alissDefaults.locationType = e.target.value;
        // Trigger a new search
        doSearch();
      });
    });
  } else {
    // Hide the filter if a specific locationType was configured
    locationTypeDiv.style.display = 'none';
  }
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
      .aliss-map .aliss-map-location-type {
        margin-bottom: 15px;
      }
      .aliss-map .aliss-map-location-type fieldset {
        border: none;
        padding: 0;
        margin: 0;
      }
      .aliss-map .aliss-map-location-type .location-type-item {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }
      .aliss-map .aliss-map-location-type .location-type-item input[type="radio"] {
        margin-right: 8px;
        width: 1.5rem;
        height:1.5rem;
      }
      .aliss-map .aliss-map-location-type .location-type-item label {
        cursor: pointer;
        margin: 0;
        font-weight:normal;
        font-size:1rem;
      }
      .aliss-map .aliss-map-categories{
        margin-bottom:10px;
        /* margin-left:20px; */
        display:flex;
        align-items:center;
        flex-wrap: wrap;
      }
      .aliss-map .aliss-map-categories .category-item {
        display: inline-flex; 
        align-items: center;
        margin-right: 15px;
        white-space: nowrap; 
      }
      .aliss-map .aliss-map-categories .category-item input[type="radio"]{
        width:1.5rem;
        height:1.5rem;
      }
        
      .aliss-map .aliss-map-categories label{
        padding:0 0 0 5px;
        cursor: pointer; 
      }

      .aliss-map #aliss-totals{
        margin-top:15px;
        margin-bottom:5px;
        font-weight:bold;
        font-size:1.1rem;
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
        flex-wrap: wrap;
      }
      .aliss-map .results-list .service-card{
        position:relative;
        margin-bottom:40px;
        margin-top:40px;

      }
      .aliss-map .results-list .service-distance{
        font-size:0.8rem;
        font-weight:bold;
        display:block;
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

      /* Enhanced Popup Styling for Better Edge Handling */
      .aliss-map .leaflet-popup {
        margin-bottom: 20px;
      }
      
      .aliss-map .leaflet-popup-content-wrapper {
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-height: 400px;
        overflow-y: auto;
      }
      
      .aliss-map .service-popup .leaflet-popup-content {
        margin: 15px;
        line-height: 1.4;
        max-width: 280px;
      }
      
      .aliss-map .leaflet-popup-tip {
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      /* Ensure popup content doesn't get too wide on small screens */
      @media (max-width: 480px) {
        .aliss-map .service-popup .leaflet-popup-content {
          max-width: 250px;
        }
        .aliss-map .leaflet-popup-content-wrapper {
          max-height: 300px;
        }
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

  // create the base map with optimized options
  map = L.map('map', {
    preferCanvas: true,  // Use canvas renderer for better performance with many markers
    zoomAnimation: false, // Disable zoom animation for better performance
    markerZoomAnimation: false, // Disable marker zoom animation
    fadeAnimation: false, // Disable fade animation
    attributionControl: false, // Add attribution separately for better initial load
    scrollWheelZoom: false // Enable only after initial load
  }).setView(alissDefaults.defaultLatLng, 12);
  
  // Add the tile layer with options for better performance
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    updateWhenZooming: false,
    updateWhenIdle: true,
    attribution: `&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy <a href="https://www.ons.gov.uk/methodology/geography/licences">Crown copyright and database right ${new Date().getFullYear()}</a> `
  }).addTo(map);
  
  // Add attribution separately
  L.control.attribution({position: 'bottomright'}).addTo(map);
  
  // Create marker cluster group with optimized options
  markersLayer = L.markerClusterGroup({
    chunkedLoading: true,
    chunkInterval: 50,
    chunkDelay: 1,
    spiderfyOnMaxZoom: false,
    disableClusteringAtZoom: 17
  });
  
  // Add it to the map
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
  buildCategoryRadioButtons(alissDefaults.categories);

  // Setup location type filter (only shows if no locationType was configured)
  setupLocationTypeFilter();

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


