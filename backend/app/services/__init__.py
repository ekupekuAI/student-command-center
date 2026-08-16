"""Application services layer.

Currently the API routers operate directly on the database session. This
package exists as the place for reusable business logic (e.g. activity
logging, cross-resource operations) when it grows.
"""